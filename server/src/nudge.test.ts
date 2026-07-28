import { describe, it, expect } from "vitest";
import { selectEligible, DEFAULT_FREQUENCY, type Activity } from "./nudge.js";

function act(id: string, frequency: Activity["frequency"] = "A"): Activity {
  return { id, title: id, frequency, active: true };
}

describe("selectEligible exclude", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("undviker den exkluderade aktiviteten när det finns fler val", () => {
    const activities = [act("a"), act("b"), act("c")];
    // rnd=0 → första i poolen. Med "a" exkluderad ska poolen bli [b, c].
    const chosen = selectEligible(activities, [], DEFAULT_FREQUENCY, now, () => 0, "a");
    expect(chosen?.id).toBe("b");
  });

  it("tillåter repris hellre än ingen nudge när det är enda valbara", () => {
    const chosen = selectEligible([act("a")], [], DEFAULT_FREQUENCY, now, () => 0, "a");
    expect(chosen?.id).toBe("a");
  });

  it("returnerar null när inget är valbart", () => {
    expect(selectEligible([], [], DEFAULT_FREQUENCY, now, () => 0, "a")).toBeNull();
  });
});

// Serverns halva av den delade schematabellen (src/lib/nudge/schedule.cases.ts).
// Klientens halva finns i src/lib/nudge/schedule.test.ts — ändra aldrig den ena
// utan den andra.

const { SCHEDULE_CASES, simulateSends, countPerDay } = await import(
  "../../src/lib/nudge/schedule.cases.js"
);
const { nextTimestamp } = await import("./nudge.js");

const TZ = "Europe/Stockholm";
/** Dagnyckel i användarens tidszon — servern räknar alltid i den, inte serverns egen. */
const tzKey = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const weekOf = (day: {
  startMinutes: number;
  endMinutes: number;
  nudgesPerDay: number;
}) =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, enabled: true, ...day }));

describe("nextTimestamp – antal nudges per dygn (delad tabell)", () => {
  for (const c of SCHEDULE_CASES) {
    it(c.name, () => {
      const days = weekOf(c.day);
      // Midnatt i Europe/Stockholm (sommartid, UTC+2).
      const from = new Date("2026-06-30T22:00:00.000Z");
      const sends = simulateSends(
        (now: Date) => nextTimestamp(now, days, TZ, "u1"),
        from,
        c.days,
      );
      const counts = countPerDay(sends, tzKey);
      for (let i = 0; i < c.days; i++) {
        const d = new Date(from.getTime() + i * 86_400_000);
        expect({ dag: tzKey(d), antal: counts.get(tzKey(d)) ?? 0 }).toEqual({
          dag: tzKey(d),
          antal: c.day.nudgesPerDay,
        });
      }
    });
  }

  it("dagens plan är stabil: omräkning ger samma tidpunkt", () => {
    const days = weekOf({
      startMinutes: 9 * 60,
      endMinutes: 21 * 60,
      nudgesPerDay: 1,
    });
    const at6 = new Date("2026-07-01T06:00:00.000Z");
    const at8 = new Date("2026-07-01T08:00:00.000Z");
    const first = nextTimestamp(at6, days, TZ, "u1");
    expect(nextTimestamp(at6, days, TZ, "u1")?.toISOString()).toBe(
      first?.toISOString(),
    );
    expect(nextTimestamp(at8, days, TZ, "u1")?.toISOString()).toBe(
      first?.toISOString(),
    );
  });

  it("olika användare får olika tidpunkter samma dag", () => {
    const days = weekOf({
      startMinutes: 9 * 60,
      endMinutes: 21 * 60,
      nudgesPerDay: 1,
    });
    const now = new Date("2026-06-30T22:00:00.000Z");
    expect(nextTimestamp(now, days, TZ, "user-a")?.toISOString()).not.toBe(
      nextTimestamp(now, days, TZ, "user-b")?.toISOString(),
    );
  });

  it("hoppet till rätt slot mitt på dagen ger samma tider som från början", () => {
    // nextTimestamp hoppar förbi passerade slots av prestandaskäl. Fröet får
    // därför inte bero på hur många slots som räknats ut innan.
    const days = weekOf({
      startMinutes: 8 * 60,
      endMinutes: 22 * 60,
      nudgesPerDay: 12,
    });
    const morgon = new Date("2026-06-30T22:00:00.000Z"); // 00:00 lokalt
    const alla = simulateSends(
      (now: Date) => nextTimestamp(now, days, TZ, "u1"),
      morgon,
      1,
    );
    // Från en tidpunkt mitt på dagen ska nästa vara exakt samma som i listan.
    const mitt = new Date("2026-07-01T12:00:00.000Z"); // 14:00 lokalt
    const väntad = alla.find((d) => d.getTime() > mitt.getTime());
    expect(nextTimestamp(mitt, days, TZ, "u1")?.toISOString()).toBe(
      väntad?.toISOString(),
    );
  });
});

describe("ett ändrat schema gäller direkt (Adams beslut)", () => {
  // Dagens plan ritas om från det nya schemat, även om dagens nudge redan gått.
  // Se CLAUDE.md: detta är RÄTT beteende — "fixa" det inte med ett dygnstak.
  it("ett ändrat schema får ge en nudge till samma dag", () => {
    const före = weekOf({
      startMinutes: 9 * 60,
      endMinutes: 21 * 60,
      nudgesPerDay: 1,
    });
    // Dagens nudge har just gått ut kl 10:00 lokal tid ur det gamla schemat.
    const nu = new Date("2026-07-01T08:00:00.000Z");
    const gammal = nextTimestamp(nu, före, TZ, "u1");
    // Användaren flyttar spannet till kvällen → planen ska rita om till ikväll,
    // inte skjuta upp till i morgon.
    const efter = weekOf({
      startMinutes: 18 * 60,
      endMinutes: 21 * 60,
      nudgesPerDay: 1,
    });
    const ny = nextTimestamp(nu, efter, TZ, "u1")!;
    const delar = new Intl.DateTimeFormat("sv-SE", {
      timeZone: TZ,
      hourCycle: "h23",
      day: "2-digit",
      hour: "2-digit",
    }).formatToParts(ny);
    const dag = delar.find((p) => p.type === "day")!.value;
    const timme = +delar.find((p) => p.type === "hour")!.value;
    expect(dag).toBe("01");
    expect(timme).toBeGreaterThanOrEqual(18);
    expect(ny.toISOString()).not.toBe(gammal?.toISOString());
  });
});
