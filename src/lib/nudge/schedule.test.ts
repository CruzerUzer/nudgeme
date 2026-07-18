import { describe, it, expect } from "vitest";
import {
  randomTimesForDay,
  isQuietHour,
  mayNudgeAt,
  minutesOfDay,
} from "./schedule";
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
