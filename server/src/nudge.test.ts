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
