import { describe, it, expect } from "vitest";
import { NudgeService } from "./service";
import { LIFECYCLE_CASES, CASE_ACTIVITIES } from "./lifecycle.cases";
import { SCHEDULE_CASES } from "./schedule.cases";
import type { DataStore, EngineState } from "@/lib/db/store";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  type Activity,
  type DaySchedule,
  type FrequencyClass,
  type FrequencySettings,
  type NotificationPrefs,
  type NudgeRecord,
} from "@/lib/types";

// Tester för klientens nudge-motor (lokalt läge). Motsvarande tester för
// serverns motor finns i server/src/engine.test.ts och kör samma delade
// scenariotabell — se src/lib/nudge/lifecycle.cases.ts.

/** Hela veckan öppen 00:00–23:00, så schemaläggningen aldrig blockerar. */
function openWeek(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: true,
    startMinutes: 0,
    endMinutes: 23 * 60,
    nudgesPerDay: 1,
  }));
}

/** In-memory-DataStore – hela motorn kan köras utan localStorage eller server. */
class FakeStore implements DataStore {
  activities: Activity[] = [];
  nudges: NudgeRecord[] = [];
  engine: EngineState = { nextNudgeAt: null };
  prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  freq: FrequencySettings = DEFAULT_FREQUENCY;
  schedule: DaySchedule[] = openWeek();

  async getUserId() {
    return "u1";
  }
  async isAuthenticated() {
    return true;
  }
  async signOut() {}
  // Kopior ut, precis som ett riktigt lager – så att motorn inte kan råka
  // mutera historiken på plats och maskera en bugg.
  async listActivities() {
    return this.activities.map((a) => ({ ...a }));
  }
  async saveActivity(a: Activity) {
    this.activities.push(a);
  }
  async deleteActivity(id: string) {
    this.activities = this.activities.filter((a) => a.id !== id);
  }
  async getFrequencySettings() {
    return this.freq;
  }
  async saveFrequencySettings(s: FrequencySettings) {
    this.freq = s;
  }
  async getSchedule() {
    return this.schedule;
  }
  async saveSchedule(s: DaySchedule[]) {
    this.schedule = s;
  }
  async getNotificationPrefs() {
    return this.prefs;
  }
  async saveNotificationPrefs(p: NotificationPrefs) {
    this.prefs = p;
  }
  async listNudges() {
    return this.nudges.map((n) => ({ ...n }));
  }
  async saveNudge(n: NudgeRecord) {
    const i = this.nudges.findIndex((x) => x.id === n.id);
    if (i >= 0) this.nudges[i] = { ...n };
    else this.nudges.push({ ...n });
  }
  async getEngineState() {
    return this.engine;
  }
  async saveEngineState(s: EngineState) {
    this.engine = s;
  }
  async savePushSubscription() {}
}

const NOW = new Date("2026-07-27T12:00:00.000Z");
const HOUR = 3_600_000;

function act(id: string, frequency: FrequencyClass = "A"): Activity {
  return {
    id,
    userId: "u1",
    title: id,
    frequency,
    tags: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function nudge(
  id: string,
  activityId: string,
  sentAt: string,
  status: NudgeRecord["status"] = "sent",
): NudgeRecord {
  return { id, userId: "u1", activityId, sentAt, status };
}

// --- Den delade scenariotabellen, körd mot klientmotorn ---------------------

describe("NudgeService.refresh – delad livscykeltabell", () => {
  for (const c of LIFECYCLE_CASES) {
    it(c.name, async () => {
      const store = new FakeStore();
      store.activities = CASE_ACTIVITIES.map((id) => act(id));
      store.prefs = { ...DEFAULT_NOTIFICATION_PREFS, paused: !!c.paused };
      store.nudges = c.history.map((h, i) =>
        nudge(
          `seed${i}`,
          h.activityId,
          new Date(NOW.getTime() - h.hoursAgo * HOUR).toISOString(),
          h.status,
        ),
      );
      store.engine = {
        nextNudgeAt: new Date(
          NOW.getTime() + (c.due ? -HOUR : HOUR),
        ).toISOString(),
      };

      await new NudgeService(store).refresh(NOW);

      const seededIds = c.history.map((_, i) => `seed${i}`);
      const created = store.nudges.filter((n) => !seededIds.includes(n.id));
      expect(created).toHaveLength(c.createsNew ? 1 : 0);
      if (c.createsNew) expect(created[0].status).toBe("sent");

      expect(
        seededIds.map((id) => store.nudges.find((n) => n.id === id)!.status),
      ).toEqual(c.after);
    });
  }

  it("skjuter alltid fram nästa tidpunkt när tillfället passerat", async () => {
    // Gäller även pausad: annars smäller en nudge direkt vid avpausning.
    for (const paused of [false, true]) {
      const store = new FakeStore();
      store.activities = [act("a1")];
      store.prefs = { ...DEFAULT_NOTIFICATION_PREFS, paused };
      store.engine = {
        nextNudgeAt: new Date(NOW.getTime() - 5 * HOUR).toISOString(),
      };

      await new NudgeService(store).refresh(NOW);

      expect(new Date(store.engine.nextNudgeAt!).getTime()).toBeGreaterThan(
        NOW.getTime(),
      );
    }
  });

  it("rör inte tidpunkten när det inte är due", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];
    const planned = new Date(NOW.getTime() + 5 * HOUR).toISOString();
    store.engine = { nextNudgeAt: planned };

    await new NudgeService(store).refresh(NOW);

    expect(store.engine.nextNudgeAt).toBe(planned);
  });
});

// --- Klientspecifikt --------------------------------------------------------

describe("NudgeService.refresh – första körningen", () => {
  it("bjuder på en nudge direkt när nextNudgeAt saknas", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];

    const view = await new NudgeService(store).refresh(NOW);

    expect(view?.activity.id).toBe("a1");
    expect(store.nudges).toHaveLength(1);
    expect(new Date(store.engine.nextNudgeAt!).getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
  });

  it("pausad nyinstallation får ingen nudge", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];
    store.prefs = { ...DEFAULT_NOTIFICATION_PREFS, paused: true };

    expect(await new NudgeService(store).refresh(NOW)).toBeNull();
    expect(store.nudges).toHaveLength(0);
  });
});

describe("NudgeService.refresh – urval av ny aktivitet", () => {
  it("undviker att direkt upprepa aktiviteten som just ersattes", async () => {
    const store = new FakeStore();
    store.activities = [act("a1"), act("a2")];
    store.nudges = [nudge("seed0", "a1", "2026-07-26T12:00:00.000Z", "sent")];
    store.engine = { nextNudgeAt: new Date(NOW.getTime() - HOUR).toISOString() };

    const view = await new NudgeService(store).refresh(NOW);

    expect(view?.activity.id).toBe("a2");
  });

  it("tillåter repris när aktiviteten är den enda valbara", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];
    store.nudges = [nudge("seed0", "a1", "2026-07-26T12:00:00.000Z", "sent")];
    store.engine = { nextNudgeAt: new Date(NOW.getTime() - HOUR).toISOString() };

    const view = await new NudgeService(store).refresh(NOW);

    expect(view?.activity.id).toBe("a1");
  });

  it("tom pool ger ingen nudge men schemat flyttas ändå fram", async () => {
    const store = new FakeStore();
    store.activities = [{ ...act("a1"), active: false }];
    store.engine = { nextNudgeAt: new Date(NOW.getTime() - HOUR).toISOString() };

    expect(await new NudgeService(store).refresh(NOW)).toBeNull();
    expect(new Date(store.engine.nextNudgeAt!).getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
  });
});

describe("NudgeService.refresh – frekvenstak", () => {
  it("en auto-ignorerad nudge förbrukar inte taket", async () => {
    // Regression: tidigare skickades den INLÄSTA historiken till urvalet, där
    // nudgen fortfarande stod som "sent". Då åts B-taket upp och den enda
    // valbara aktiviteten föll bort → ingen nudge alls den gången.
    const store = new FakeStore();
    store.activities = [act("b1", "B")];
    store.nudges = [nudge("seed0", "b1", "2026-07-26T12:00:00.000Z", "sent")];
    store.engine = { nextNudgeAt: new Date(NOW.getTime() - HOUR).toISOString() };

    const view = await new NudgeService(store).refresh(NOW);

    expect(view?.activity.id).toBe("b1");
    expect(store.nudges.find((n) => n.id === "seed0")!.status).toBe("ignored");
  });

  it("appen tystnar aldrig varannan gång med en enda takad aktivitet", async () => {
    const store = new FakeStore();
    store.activities = [act("b1", "B")];
    const service = new NudgeService(store);

    for (let day = 0; day < 6; day++) {
      const now = new Date(Date.UTC(2026, 6, 1 + day, 10));
      store.engine = { nextNudgeAt: new Date(now.getTime() - HOUR).toISOString() };
      expect(await service.refresh(now)).not.toBeNull();
    }
  });

  it("en aktivitet användaren FAKTISKT gjorde förbrukar taket", async () => {
    // Motsatsen till fallet ovan: "done" räknas, så B-aktiviteten är slut för
    // veckan och poolen blir tom.
    const store = new FakeStore();
    store.activities = [act("b1", "B")];
    store.nudges = [nudge("seed0", "b1", "2026-07-26T12:00:00.000Z", "done")];
    store.engine = { nextNudgeAt: new Date(NOW.getTime() - HOUR).toISOString() };

    expect(await new NudgeService(store).refresh(NOW)).toBeNull();
  });
});

describe("NudgeService.currentNudge", () => {
  it("visar den senast skickade av flera synliga", async () => {
    const store = new FakeStore();
    store.activities = [act("a1"), act("a2")];
    store.nudges = [
      nudge("n1", "a1", "2026-07-26T12:00:00.000Z", "sent"),
      nudge("n2", "a2", "2026-07-27T09:00:00.000Z", "committed"),
    ];

    const view = await new NudgeService(store).currentNudge(NOW);

    expect(view?.activity.id).toBe("a2");
  });

  it("döljer avslutade nudges (done/ignored/snoozed)", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];
    for (const status of ["done", "ignored", "snoozed"] as const) {
      store.nudges = [nudge("n1", "a1", "2026-07-27T09:00:00.000Z", status)];
      expect(await new NudgeService(store).currentNudge(NOW)).toBeNull();
    }
  });

  it("ger null när aktiviteten hunnit raderas", async () => {
    const store = new FakeStore();
    store.nudges = [nudge("n1", "borta", "2026-07-27T09:00:00.000Z", "sent")];

    expect(await new NudgeService(store).currentNudge(NOW)).toBeNull();
  });
});

describe("NudgeService – uppföljningsfrågan", () => {
  const committed = (sentAt: string, followUpAskedAt?: string): NudgeRecord => ({
    ...nudge("n1", "a1", sentAt, "committed"),
    followUpAskedAt,
  });

  async function ask(rec: NudgeRecord) {
    const store = new FakeStore();
    store.activities = [act("a1")];
    store.nudges = [rec];
    return (await new NudgeService(store).currentNudge(NOW))?.needsFollowUp;
  }

  it("ställs efter followUpAfterHours på ett åtagande", async () => {
    // 6 timmar är default; nudgen är 7 timmar gammal.
    expect(await ask(committed("2026-07-27T05:00:00.000Z"))).toBe(true);
  });

  it("ställs inte innan tiden gått", async () => {
    expect(await ask(committed("2026-07-27T11:00:00.000Z"))).toBe(false);
  });

  it("ställs aldrig två gånger", async () => {
    expect(
      await ask(
        committed("2026-07-27T05:00:00.000Z", "2026-07-27T11:30:00.000Z"),
      ),
    ).toBe(false);
  });

  it("ställs inte på en nudge som bara är ackad", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];
    store.nudges = [nudge("n1", "a1", "2026-07-27T05:00:00.000Z", "acked")];

    const view = await new NudgeService(store).currentNudge(NOW);

    expect(view?.needsFollowUp).toBe(false);
  });
});

describe("NudgeService – livscykelövergångar", () => {
  async function withNudge(status: NudgeRecord["status"] = "sent") {
    const store = new FakeStore();
    store.activities = [act("a1")];
    store.nudges = [nudge("n1", "a1", "2026-07-27T09:00:00.000Z", status)];
    return { store, service: new NudgeService(store) };
  }
  const rec = (store: FakeStore) => store.nudges.find((n) => n.id === "n1")!;

  it("ack sätter acked + tidsstämpel", async () => {
    const { store, service } = await withNudge();
    await service.ack("n1", NOW);
    expect(rec(store).status).toBe("acked");
    expect(rec(store).ackedAt).toBe(NOW.toISOString());
  });

  it("ack nedgraderar inte ett åtagande", async () => {
    const { store, service } = await withNudge("committed");
    await service.ack("n1", NOW);
    expect(rec(store).status).toBe("committed");
  });

  it("commit sätter committed", async () => {
    const { store, service } = await withNudge();
    await service.commit("n1", NOW);
    expect(rec(store).status).toBe("committed");
  });

  it("markDone sätter done + doneAt", async () => {
    const { store, service } = await withNudge("committed");
    await service.markDone("n1", NOW);
    expect(rec(store).status).toBe("done");
    expect(rec(store).doneAt).toBe(NOW.toISOString());
  });

  it("snooze sätter snoozed", async () => {
    const { store, service } = await withNudge();
    await service.snooze("n1");
    expect(rec(store).status).toBe("snoozed");
  });

  it("reviveSnoozed gör den aktuell igen som ett åtagande, inte genomförd", async () => {
    const { store, service } = await withNudge("snoozed");
    await service.reviveSnoozed("n1", NOW);
    expect(rec(store).status).toBe("committed");
    expect(rec(store).sentAt).toBe(NOW.toISOString());
    expect(rec(store).doneAt).toBeUndefined();
  });

  it("övergång på ett okänt id är en tyst nulloperation", async () => {
    const { store, service } = await withNudge();
    await service.markDone("finns-inte", NOW);
    expect(rec(store).status).toBe("sent");
  });

  it("markFollowUpAsked stämplar frågan som ställd", async () => {
    const { store, service } = await withNudge("committed");
    await service.markFollowUpAsked("n1", NOW);
    expect(rec(store).followUpAskedAt).toBe(NOW.toISOString());
  });
});

describe("NudgeService – på begäran", () => {
  it("Överraska mig respekterar frekvenstaket", async () => {
    const store = new FakeStore();
    store.activities = [act("b1", "B")];
    store.nudges = [nudge("n1", "b1", "2026-07-26T12:00:00.000Z", "done")];

    expect(await new NudgeService(store).surprise(NOW)).toBeNull();
  });

  it("completeOnDemand loggas som genomförd i historiken", async () => {
    const store = new FakeStore();
    store.activities = [act("a1")];

    await new NudgeService(store).completeOnDemand("a1", NOW);

    expect(store.nudges[0]).toMatchObject({
      activityId: "a1",
      status: "done",
      doneAt: NOW.toISOString(),
    });
  });

  it("history sorteras nyast först", async () => {
    const store = new FakeStore();
    store.nudges = [
      nudge("n1", "a1", "2026-07-20T12:00:00.000Z", "done"),
      nudge("n2", "a2", "2026-07-25T12:00:00.000Z", "done"),
    ];

    const hist = await new NudgeService(store).history();

    expect(hist.map((n) => n.id)).toEqual(["n2", "n1"]);
  });
});

// --- Antal nudges per dygn: HELA motorn, inte bara schemafunktionen ---------
// Rena schematester räcker inte. `nextNudgeTimestamp` kan vara helt korrekt
// medan motorn anropar den fel (t.ex. med ett frö som varierar per anrop) — då
// är buggen "2–3 nudges per dag" tillbaka utan att ett enda schematest blir
// rött. Därför körs refresh() här som appen gör det, minut för minut.
// Serverns motsvarighet finns i server/src/engine.test.ts.

describe("motorn skickar inte fler nudges än schemat säger", () => {
  // Körs för HELA den delade tabellen (1/dag, 3/dag, smalt spann) så att inte
  // bara enkelfallet är skyddat — en användare kan ha flera per dag.
  for (const c of SCHEDULE_CASES) {
    it(`${c.day.nudgesPerDay}/dag ger exakt ${c.day.nudgesPerDay} nudge(s) per dygn`, async () => {
      const store = new FakeStore();
      store.activities = ["a1", "a2", "a3"].map((id) => act(id)); // frekvens A = inget tak
      store.schedule = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        enabled: true,
        ...c.day,
      }));
      const service = new NudgeService(store);

      // Lokal midnatt. Första refresh() ger med flit en välkomstnudge (nytt
      // konto) — den räknas bort genom att bara dygn 1+ mäts.
      const start = new Date(2026, 6, 1, 0, 0, 0, 0);
      const DYGN = 4;
      for (let m = 0; m <= DYGN * 24 * 60; m++) {
        await service.refresh(new Date(start.getTime() + m * 60_000));
      }

      const dagnyckel = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate(),
        ).padStart(2, "0")}`;
      const perDag = new Map<string, number>();
      for (const n of store.nudges) {
        const k = dagnyckel(new Date(n.sentAt));
        perDag.set(k, (perDag.get(k) ?? 0) + 1);
      }
      for (let i = 1; i < DYGN; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const k = dagnyckel(d);
        expect({ dag: k, antal: perDag.get(k) ?? 0 }).toEqual({
          dag: k,
          antal: c.day.nudgesPerDay,
        });
      }
    });
  }
});
