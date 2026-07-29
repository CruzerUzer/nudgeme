import { describe, it, expect } from "vitest";
import {
  randomTimesForDay,
  isQuietHour,
  mayNudgeAt,
  minutesOfDay,
  nextNudgeTimestamp,
} from "./schedule";
import {
  REPLAN_CASES,
  SCHEDULE_CASES,
  countPerDay,
  simulateSends,
} from "./schedule.cases";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/types";
import type { DaySchedule } from "@/lib/types";

const day: DaySchedule = {
  weekday: 1,
  enabled: true,
  startMinutes: 9 * 60,
  endMinutes: 21 * 60,
  nudgesPerDay: 3,
};

describe("randomTimesForDay", () => {
  it("returns N sorted times within the span", () => {
    const times = randomTimesForDay(day, () => 0.5);
    expect(times).toHaveLength(3);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(day.startMinutes);
      expect(t).toBeLessThanOrEqual(day.endMinutes);
    }
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("returns nothing for a disabled day", () => {
    expect(randomTimesForDay({ ...day, enabled: false })).toEqual([]);
  });
});

describe("isQuietHour", () => {
  it("handles spans crossing midnight (22:00–07:00)", () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS };
    expect(isQuietHour(23 * 60, prefs)).toBe(true);
    expect(isQuietHour(3 * 60, prefs)).toBe(true);
    expect(isQuietHour(12 * 60, prefs)).toBe(false);
  });
});

describe("mayNudgeAt", () => {
  it("blocks when paused", () => {
    const at = new Date("2026-07-20T12:00:00");
    expect(mayNudgeAt(at, day, { ...DEFAULT_NOTIFICATION_PREFS, paused: true })).toBe(
      false,
    );
  });

  it("allows a time inside the span and outside quiet hours", () => {
    const at = new Date("2026-07-20T12:00:00");
    expect(minutesOfDay(at)).toBe(12 * 60);
    expect(mayNudgeAt(at, day, DEFAULT_NOTIFICATION_PREFS)).toBe(true);
  });

  it("blocks a time outside the day span", () => {
    const at = new Date("2026-07-20T08:00:00");
    expect(mayNudgeAt(at, day, DEFAULT_NOTIFICATION_PREFS)).toBe(false);
  });
});

// Klientmotorns halva av den delade schematabellen (./schedule.cases.ts).
// Serverns halva finns i server/src/nudge.test.ts — ändra aldrig den ena utan
// den andra.

/** Dagnyckel i lokal tid — klientmotorn räknar i webbläsarens tidszon. */
const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const weekOf = (day: { startMinutes: number; endMinutes: number; nudgesPerDay: number }) =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, enabled: true, ...day }));

describe("nextNudgeTimestamp – antal nudges per dygn (delad tabell)", () => {
  for (const c of SCHEDULE_CASES) {
    it(c.name, () => {
      const schedule = weekOf(c.day);
      const from = new Date(2026, 6, 1, 0, 0, 0, 0); // lokal midnatt
      const sends = simulateSends(
        (now) => nextNudgeTimestamp(now, schedule),
        from,
        c.days,
      );
      const counts = countPerDay(sends, localKey);
      for (let i = 0; i < c.days; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        expect({ dag: localKey(d), antal: counts.get(localKey(d)) ?? 0 }).toEqual({
          dag: localKey(d),
          antal: c.day.nudgesPerDay,
        });
      }
    });
  }

  it("dagens plan är stabil: omräkning ger samma tidpunkt", () => {
    const schedule = weekOf({
      startMinutes: 9 * 60,
      endMinutes: 21 * 60,
      nudgesPerDay: 1,
    });
    // Samma "nu" ska ge samma svar, och ett tidigare "nu" samma dygn ska ge
    // samma tidpunkt — annars kan ett sparat schema rulla fram en extra nudge.
    const at8 = new Date(2026, 6, 1, 8, 0, 0, 0);
    const at9 = new Date(2026, 6, 1, 9, 0, 0, 0);
    const first = nextNudgeTimestamp(at8, schedule);
    expect(nextNudgeTimestamp(at8, schedule)?.toISOString()).toBe(
      first?.toISOString(),
    );
    expect(nextNudgeTimestamp(at9, schedule)?.toISOString()).toBe(
      first?.toISOString(),
    );
  });

  it("olika användare får olika tidpunkter samma dag", () => {
    const schedule = weekOf({
      startMinutes: 9 * 60,
      endMinutes: 21 * 60,
      nudgesPerDay: 1,
    });
    const from = new Date(2026, 6, 1, 0, 0, 0, 0);
    const a = nextNudgeTimestamp(from, schedule, "user-a");
    const b = nextNudgeTimestamp(from, schedule, "user-b");
    expect(a?.toISOString()).not.toBe(b?.toISOString());
  });
});

describe("dygnsräknaren styr omplaneringen (delad tabell)", () => {
  // En omräkning mitt på dagen får aldrig återuppliva en slot som redan gått ut.
  // Se ./schedule.cases.ts för regeln och bakgrunden.
  for (const c of REPLAN_CASES) {
    it(c.name, () => {
      // Mitt på dagen: dygnets kvot är delvis förbrukad.
      const nu = new Date(2026, 6, 1, 12, 0, 0, 0);
      const schema = weekOf(c.changedTo ?? c.day);
      const nästa = nextNudgeTimestamp(nu, schema, "u1", c.delivered);
      expect(nästa).not.toBeNull();
      expect({ sammaDygn: localKey(nästa!) === localKey(nu) }).toEqual({
        sammaDygn: c.sameDay,
      });
    });
  }
});
