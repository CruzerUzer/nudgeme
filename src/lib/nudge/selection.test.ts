import { describe, it, expect } from "vitest";
import {
  countRecentNudges,
  isEligible,
  eligiblePool,
  selectNudge,
} from "./selection";
import { DEFAULT_FREQUENCY } from "@/lib/types";
import type { Activity, NudgeRecord } from "@/lib/types";

function activity(id: string, freq: Activity["frequency"]): Activity {
  return {
    id,
    userId: "u1",
    title: id,
    description: "",
    frequency: freq,
    tags: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function nudge(
  activityId: string,
  sentAt: string,
  status: NudgeRecord["status"] = "sent",
): NudgeRecord {
  return { id: activityId + sentAt, userId: "u1", activityId, sentAt, status };
}

const NOW = new Date("2026-07-18T12:00:00Z");

describe("countRecentNudges", () => {
  it("counts nudges within the window and ignores auto-ignored ones", () => {
    const history = [
      nudge("a", "2026-07-17T12:00:00Z", "done"),
      nudge("a", "2026-07-16T12:00:00Z", "ignored"), // ska ej räknas
      nudge("a", "2026-05-01T12:00:00Z", "done"), // utanför 7-dagarsfönster
    ];
    expect(countRecentNudges(history, "a", NOW, 7)).toBe(1);
  });
});

describe("isEligible", () => {
  it("class A has no limit", () => {
    const a = activity("a", "A");
    const history = Array.from({ length: 50 }, (_, i) =>
      nudge("a", `2026-07-18T0${i % 9}:00:00Z`),
    );
    expect(isEligible(a, DEFAULT_FREQUENCY, history, NOW)).toBe(true);
  });

  it("class B blocks a second nudge within the same week", () => {
    const b = activity("b", "B");
    const history = [nudge("b", "2026-07-15T12:00:00Z", "acked")];
    expect(isEligible(b, DEFAULT_FREQUENCY, history, NOW)).toBe(false);
  });

  it("class D allows up to 2 per year", () => {
    const d = activity("d", "D");
    const one = [nudge("d", "2026-02-01T12:00:00Z", "done")];
    expect(isEligible(d, DEFAULT_FREQUENCY, one, NOW)).toBe(true);
    const two = [...one, nudge("d", "2026-04-01T12:00:00Z", "done")];
    expect(isEligible(d, DEFAULT_FREQUENCY, two, NOW)).toBe(false);
  });

  it("inactive activities are never eligible", () => {
    const a = { ...activity("a", "A"), active: false };
    expect(isEligible(a, DEFAULT_FREQUENCY, [], NOW)).toBe(false);
  });
});

describe("selectNudge", () => {
  const activities = [
    activity("a", "A"),
    activity("b", "B"),
    activity("c", "C"),
  ];

  it("excludes capped activities from the pool", () => {
    const history = [nudge("b", "2026-07-17T12:00:00Z", "acked")];
    const pool = eligiblePool(activities, DEFAULT_FREQUENCY, history, NOW);
    expect(pool.map((a) => a.id).sort()).toEqual(["a", "c"]);
  });

  it("returns null when nothing is eligible", () => {
    const empty: Activity[] = [];
    expect(selectNudge(empty, DEFAULT_FREQUENCY, [], NOW)).toBeNull();
  });

  it("respects the exclude id when the pool allows it", () => {
    // rnd=0 skulle normalt välja första ('a'); exkludera 'a'
    const chosen = selectNudge(
      activities,
      DEFAULT_FREQUENCY,
      [],
      NOW,
      () => 0,
      "a",
    );
    expect(chosen?.id).not.toBe("a");
  });
});
