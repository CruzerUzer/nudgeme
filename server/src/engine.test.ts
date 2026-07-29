import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolerad temp-DB innan db.ts importeras (den läser NUDGEME_DB vid import).
const tmp = mkdtempSync(join(tmpdir(), "nudgeme-engine-"));
process.env.NUDGEME_DB = join(tmp, "test.db");

const { db } = await import("./db.js");
const { repo } = await import("./repo.js");
const { tick, initUserEngine, triggerNudge, reschedule } = await import(
  "./engine.js"
);
const { DEFAULT_NOTIFICATION_PREFS } = await import("./nudge.js");
const { LIFECYCLE_CASES, CASE_ACTIVITIES } = await import(
  "../../src/lib/nudge/lifecycle.cases.js"
);
const { SCHEDULE_CASES } = await import(
  "../../src/lib/nudge/schedule.cases.js"
);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// Tester för serverns nudge-motor. Klientens motsvarighet finns i
// src/lib/nudge/service.test.ts och kör samma delade scenariotabell — se
// src/lib/nudge/lifecycle.cases.ts.

const NOW = new Date("2026-07-27T12:00:00.000Z");
const HOUR = 3_600_000;

function mkUser(id: string) {
  db.prepare(
    "insert into users (id, username, password_hash, created_at) values (?,?,?,?)",
  ).run(id, id, "x", "2026-01-01T00:00:00Z");
}

function addActivity(
  userId: string,
  id: string,
  frequency: "A" | "B" | "C" | "D" = "A",
) {
  repo.upsertActivity(userId, {
    id: `${userId}-${id}`,
    userId,
    title: id,
    frequency,
    tags: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
  });
}

function addNudge(
  userId: string,
  id: string,
  activityId: string,
  sentAt: string,
  status: string,
) {
  repo.upsertNudge(userId, { id, userId, activityId, sentAt, status });
}

/** Parkera användaren så senare tick() inte plockar upp den igen. */
function park(userId: string) {
  repo.setKv(userId, "engine", { nextNudgeAt: null });
}

/** getEngine returnerar sitt fallback-värde ({nextNudgeAt: null}) som typ. */
function nextAt(userId: string): string | null {
  return (repo.getEngine(userId) as { nextNudgeAt: string | null }).nextNudgeAt;
}

function setDue(userId: string, due: boolean) {
  repo.setKv(userId, "engine", {
    nextNudgeAt: new Date(NOW.getTime() + (due ? -HOUR : HOUR)).toISOString(),
  });
}

// --- Den delade scenariotabellen, körd mot servermotorn ---------------------

describe("engine.tick – delad livscykeltabell", () => {
  LIFECYCLE_CASES.forEach((c, idx) => {
    it(c.name, () => {
      const u = `case${idx}`;
      mkUser(u);
      for (const a of CASE_ACTIVITIES) addActivity(u, a);
      repo.setKv(u, "notifPrefs", {
        ...DEFAULT_NOTIFICATION_PREFS,
        paused: !!c.paused,
      });
      const seededIds = c.history.map((h, i) => {
        const id = `${u}-seed${i}`;
        addNudge(
          u,
          id,
          `${u}-${h.activityId}`,
          new Date(NOW.getTime() - h.hoursAgo * HOUR).toISOString(),
          h.status,
        );
        return id;
      });
      setDue(u, c.due);

      tick(NOW);

      const after = repo.listNudges(u);
      const created = after.filter((n) => !seededIds.includes(n.id));
      expect(created).toHaveLength(c.createsNew ? 1 : 0);
      if (c.createsNew) expect(created[0].status).toBe("sent");

      expect(
        seededIds.map((id) => after.find((n) => n.id === id)!.status),
      ).toEqual(c.after);

      park(u);
    });
  });

  it("skjuter alltid fram nästa tidpunkt när tillfället passerat", () => {
    // Gäller även pausad: annars smäller en nudge direkt vid avpausning.
    for (const paused of [false, true]) {
      const u = `frammat-${paused}`;
      mkUser(u);
      addActivity(u, "a1");
      repo.setKv(u, "notifPrefs", { ...DEFAULT_NOTIFICATION_PREFS, paused });
      repo.setKv(u, "engine", {
        nextNudgeAt: new Date(NOW.getTime() - 5 * HOUR).toISOString(),
      });

      tick(NOW);

      expect(new Date(nextAt(u)!).getTime()).toBeGreaterThan(NOW.getTime());
      park(u);
    }
  });
});

// --- Serverspecifikt --------------------------------------------------------

describe("engine.tick – vilka användare berörs", () => {
  it("rör inte en användare vars tidpunkt ligger i framtiden", () => {
    const u = "framtid";
    mkUser(u);
    addActivity(u, "a1");
    const planned = new Date(NOW.getTime() + 5 * HOUR).toISOString();
    repo.setKv(u, "engine", { nextNudgeAt: planned });

    tick(NOW);

    expect(repo.listNudges(u)).toHaveLength(0);
    expect(repo.getEngine(u)).toEqual({ nextNudgeAt: planned });
    park(u);
  });

  it("håller användare isär", () => {
    const [a, b] = ["iso-a", "iso-b"];
    mkUser(a);
    mkUser(b);
    addActivity(a, "a1");
    addActivity(b, "a1");
    setDue(a, true);
    setDue(b, false);

    tick(NOW);

    expect(repo.listNudges(a)).toHaveLength(1);
    expect(repo.listNudges(b)).toHaveLength(0);
    park(a);
    park(b);
  });

  it("ett fel på en användare stoppar inte de andra", () => {
    const [bad, good] = ["fel-user", "ok-user"];
    mkUser(bad);
    mkUser(good);
    addActivity(bad, "a1");
    addActivity(good, "a1");
    setDue(bad, true);
    setDue(good, true);

    const original = repo.listActivities.bind(repo);
    const spy = vi
      .spyOn(repo, "listActivities")
      .mockImplementation((userId: string) => {
        if (userId === bad) throw new Error("boom");
        return original(userId);
      });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    tick(NOW);

    spy.mockRestore();
    quiet.mockRestore();

    expect(repo.listNudges(bad)).toHaveLength(0);
    expect(repo.listNudges(good)).toHaveLength(1);
    park(bad);
    park(good);
  });
});

describe("initUserEngine", () => {
  it("ger ett nytt konto en nudge direkt och schemalägger nästa", () => {
    const u = "nykomling";
    mkUser(u);
    addActivity(u, "a1");

    initUserEngine(u, NOW);

    expect(repo.listNudges(u)).toHaveLength(1);
    expect(new Date(nextAt(u)!).getTime()).toBeGreaterThan(NOW.getTime());
    park(u);
  });
});

describe("triggerNudge (admin-test)", () => {
  it("ersätter även en engagerad nudge – testet ska alltid ge något nytt", () => {
    const u = "trigger-engagerad";
    mkUser(u);
    addActivity(u, "a1");
    addActivity(u, "a2");
    addNudge(u, "t1", `${u}-a1`, "2026-07-26T12:00:00.000Z", "committed");

    const res = triggerNudge(u, NOW);

    expect(res.created).toBe(true);
    expect(repo.listNudges(u).find((n) => n.id === "t1")!.status).toBe("ignored");
    expect(repo.listNudges(u).filter((n) => n.status === "sent")).toHaveLength(1);
    park(u);
  });

  it("rapporterar pushed=false utan prenumerationer", () => {
    const u = "trigger-utan-push";
    mkUser(u);
    addActivity(u, "a1");

    expect(triggerNudge(u, NOW).pushed).toBe(false);
    park(u);
  });

  it("rapporterar created=false när inget är valbart", () => {
    const u = "trigger-tom";
    mkUser(u);

    expect(triggerNudge(u, NOW).created).toBe(false);
    park(u);
  });
});

describe("frekvenstak i motorn", () => {
  it("en auto-ignorerad nudge förbrukar inte taket", () => {
    // Regression: tidigare skickades den INLÄSTA historiken till urvalet, där
    // nudgen fortfarande stod som "sent". Då åts B-taket upp och den enda
    // valbara aktiviteten föll bort → ingen nudge alls den gången.
    const u = "tak-ignorerad";
    mkUser(u);
    addActivity(u, "b1", "B");
    addNudge(u, "k1", `${u}-b1`, "2026-07-26T12:00:00.000Z", "sent");
    setDue(u, true);

    tick(NOW);

    expect(repo.listNudges(u).filter((n) => n.status === "sent")).toHaveLength(1);
    expect(repo.listNudges(u).find((n) => n.id === "k1")!.status).toBe("ignored");
    park(u);
  });

  it("en aktivitet användaren faktiskt gjorde förbrukar taket", () => {
    const u = "tak-done";
    mkUser(u);
    addActivity(u, "b1", "B");
    addNudge(u, "k2", `${u}-b1`, "2026-07-26T12:00:00.000Z", "done");
    setDue(u, true);

    tick(NOW);

    expect(repo.listNudges(u).filter((n) => n.status === "sent")).toHaveLength(0);
    park(u);
  });
});

describe("done är terminal (offline-replay-guard)", () => {
  it("motorns auto-ignorering kan aldrig backa en genomförd nudge", () => {
    const u = "done-guard";
    mkUser(u);
    addActivity(u, "a1");
    addNudge(u, "d1", `${u}-a1`, "2026-07-26T12:00:00.000Z", "done");

    // En sen offline-replay försöker skriva tillbaka ett äldre tillstånd.
    addNudge(u, "d1", `${u}-a1`, "2026-07-26T12:00:00.000Z", "sent");

    expect(repo.listNudges(u).find((n) => n.id === "d1")!.status).toBe("done");
    park(u);
  });
});

describe("motorn tystnar aldrig varannan gång", () => {
  it("en enda takad aktivitet ger nudge varje dag den är due", () => {
    const u = "aldrig-tyst";
    mkUser(u);
    addActivity(u, "b1", "B");

    for (let day = 0; day < 6; day++) {
      const now = new Date(Date.UTC(2026, 6, 1 + day, 10));
      repo.setKv(u, "engine", {
        nextNudgeAt: new Date(now.getTime() - HOUR).toISOString(),
      });

      tick(now);

      expect(repo.listNudges(u).filter((n) => n.status === "sent")).toHaveLength(1);
    }
    park(u);
  });
});

// beforeAll sist så filen läses uppifrån och ner utan att hoppa.
beforeAll(() => {
  // Motorn ska inte försöka skicka push i testerna (inga VAPID-nycklar satta).
  expect(process.env.VAPID_PUBLIC_KEY).toBeUndefined();
});

// --- Antal nudges per dygn: HELA motorn, inte bara schemafunktionen ---------
// Rena schematester räcker inte. `nextTimestamp` kan vara helt korrekt medan
// motorn anropar den fel (t.ex. med ett frö som varierar per anrop) — då är
// buggen "2–3 nudges per dag" tillbaka utan att ett enda schematest blir rött.
// Därför körs motorn här på riktigt, tick för tick, ett dygn i taget.
// Klientens motsvarighet finns i src/lib/nudge/service.test.ts.

describe("motorn skickar inte fler nudges än schemat säger", () => {
  // Körs för HELA den delade tabellen (1/dag, 3/dag, smalt spann) så att inte
  // bara enkelfallet är skyddat — en användare kan ha flera per dag.
  for (const c of SCHEDULE_CASES) {
    it(`${c.day.nudgesPerDay}/dag ger exakt ${c.day.nudgesPerDay} nudge(s) per dygn`, () => {
      const u = `perdygn-${c.day.nudgesPerDay}-${c.day.startMinutes}`;
      mkUser(u);
      for (const a of ["a1", "a2", "a3"]) addActivity(u, a); // frekvens A = inget tak
      repo.setKv(u, "notifPrefs", {
        ...DEFAULT_NOTIFICATION_PREFS,
        paused: false,
        // Tysta timmar får inte skära av spannet i det här testet.
        quietStartMinutes: 0,
        quietEndMinutes: 0,
      });
      repo.setKv(
        u,
        "schedule",
        Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          enabled: true,
          ...c.day,
        })),
      );

      // Midnatt i Europe/Stockholm (sommartid). initUserEngine ger med flit en
      // välkomstnudge direkt — den räknas bort genom att bara dygn 1+ mäts.
      const start = new Date("2026-06-30T22:00:00.000Z");
      const DYGN = 4;
      initUserEngine(u, start);
      for (let m = 1; m <= DYGN * 24 * 60; m++) {
        tick(new Date(start.getTime() + m * 60_000));
      }

      const dagnyckel = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const perDag = new Map<string, number>();
      for (const n of repo.listNudges(u)) {
        const k = dagnyckel.format(new Date(n.sentAt));
        perDag.set(k, (perDag.get(k) ?? 0) + 1);
      }
      for (let i = 1; i < DYGN; i++) {
        const k = dagnyckel.format(new Date(start.getTime() + i * 86_400_000));
        expect({ dag: k, antal: perDag.get(k) ?? 0 }).toEqual({
          dag: k,
          antal: c.day.nudgesPerDay,
        });
      }

      park(u);
    });
  }
});

// --- Omplanering mitt i dygnet ----------------------------------------------
// Regression: klienten skickar enhetens tidszon vid VARJE appstart och fokus.
// Byttes den (två enheter i olika tidszon, eller en webbläsare på en UTC-maskin)
// ritade PUT /timezone om dagens plan från noll — en redan levererad slot kunde
// återuppstå senare samma dag → två aktiviteter trots "1 per dag".
// Klientens motsvarighet finns i src/lib/nudge/service.test.ts.

describe("omräkning mitt i dygnet ger ingen extra nudge", () => {
  function dygnsUser(u: string) {
    mkUser(u);
    for (const a of ["a1", "a2", "a3"]) addActivity(u, a); // frekvens A = inget tak
    repo.setKv(u, "notifPrefs", {
      ...DEFAULT_NOTIFICATION_PREFS,
      quietStartMinutes: 0,
      quietEndMinutes: 0,
    });
    repo.setTimeZone(u, "Europe/Stockholm");
    repo.setKv(
      u,
      "schedule",
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        enabled: true,
        startMinutes: 9 * 60,
        endMinutes: 21 * 60,
        nudgesPerDay: 1,
      })),
    );
  }

  const dagnyckel = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  it("tidszonsbytet ger ingen extra nudge samma dag", () => {
    const u = "tz-studs";
    dygnsUser(u);
    // Midnatt i Europe/Stockholm. Välkomstnudgen räknas bort (bara dygn 2 mäts).
    const start = new Date("2026-06-30T22:00:00.000Z");
    initUserEngine(u, start);
    for (let m = 1; m <= 24 * 60; m++) tick(new Date(start.getTime() + m * 60_000));

    // Dygn 2: telefonen (Stockholm) och en webbläsare på en UTC-maskin skickar
    // sin tidszon varannan timme — exakt vad PUT /api/timezone gör.
    const dag2 = new Date(start.getTime() + 86_400_000);
    for (let m = 1; m <= 24 * 60; m++) {
      const now = new Date(dag2.getTime() + m * 60_000);
      tick(now);
      if (m % 120 === 0) {
        const tz = (m / 120) % 2 === 0 ? "Europe/Stockholm" : "UTC";
        if (tz !== repo.getTimeZone(u)) {
          repo.setTimeZone(u, tz);
          reschedule(u, now);
        }
      }
    }

    const nyckel = dagnyckel.format(new Date(dag2.getTime() + 12 * 3_600_000));
    const antal = repo
      .listNudges(u)
      .filter((n) => dagnyckel.format(new Date(n.sentAt)) === nyckel).length;
    expect({ dag: nyckel, antal }).toEqual({ dag: nyckel, antal: 1 });
    park(u);
  });

  it("admin-testet lämnar dygnets kvot och nästa tidpunkt orörda", () => {
    // Testnudgen ska varken äta dagens riktiga aktivitet eller flytta planen:
    // `generate` räknar upp kvoten, och triggerNudge lägger tillbaka den.
    const u = "trigger-kvot";
    dygnsUser(u);
    const start = new Date("2026-06-30T22:00:00.000Z");
    repo.setKv(u, "engine", { nextNudgeAt: null });
    reschedule(u, start); // planera dagen utan välkomstnudge
    const före = repo.getEngine(u);

    const res = triggerNudge(u, new Date(start.getTime() + 9 * 3_600_000)); // kl 09

    expect(res).toMatchObject({ created: true, delivered: 0, planned: 1 });
    expect(repo.getEngine(u)).toEqual(före);
    // Och dagens riktiga nudge kommer fortfarande, som planerat.
    for (let m = 1; m <= 24 * 60; m++) tick(new Date(start.getTime() + m * 60_000));
    const nyckel = dagnyckel.format(new Date(start.getTime() + 12 * 3_600_000));
    const antal = repo
      .listNudges(u)
      .filter((n) => dagnyckel.format(new Date(n.sentAt)) === nyckel).length;
    expect({ dag: nyckel, antal }).toEqual({ dag: nyckel, antal: 2 }); // test + riktig
    park(u);
  });

  it("dygnets kvot läses av och rapporteras till admin", () => {
    const u = "trigger-kvot-avläst";
    dygnsUser(u);
    const start = new Date("2026-06-30T22:00:00.000Z");
    initUserEngine(u, start); // välkomstnudgen förbrukar dygnets enda slot

    const res = triggerNudge(u, new Date(start.getTime() + 9 * 3_600_000));

    expect(res).toMatchObject({ delivered: 1, planned: 1 });
    park(u);
  });
});
