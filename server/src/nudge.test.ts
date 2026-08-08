import { describe, it, expect } from "vitest";
import {
  selectEligible,
  readiness,
  DEFAULT_FREQUENCY,
  READINESS_ROLLOUT_AT,
  type Activity,
  type NudgeRow,
} from "./nudge.js";

function act(id: string, frequency: Activity["frequency"] = "A"): Activity {
  return { id, title: id, frequency, active: true };
}

function row(
  activityId: string,
  sentAt: string,
  status = "done",
): NudgeRow {
  return { id: activityId + sentAt, activity_id: activityId, sent_at: sentAt, status };
}

const now = new Date("2026-07-27T12:00:00.000Z");

describe("selectEligible exclude", () => {
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

  it("viktar mot readiness i stället för uniform slump", () => {
    // "a" (klass A, konstant vikt 1) och "b" (klass D, nyss skickad men
    // fortfarande under sitt tak (1 av 2 tillåtna) → vikt 0) ger total vikt 1
    // → rnd ska alltid ge "a", oavsett rnd-värde. Med den gamla uniforma
    // slumpen (pool[floor(rnd*pool.length)]) hade rnd nära 1 gett "b".
    // "nu" måste ligga efter READINESS_ROLLOUT_AT, annars ignoreras "b"s
    // sändning av brytpunkten och den hamnar på 0,5 i stället för 0.
    const rolloutNow = new Date(READINESS_ROLLOUT_AT + 86_400_000);
    const activities = [act("a", "A"), act("b", "D")];
    const history = [row("b", rolloutNow.toISOString(), "done")];
    for (const rnd of [0, 0.4, 0.999]) {
      expect(
        selectEligible(activities, history, DEFAULT_FREQUENCY, rolloutNow, () => rnd)?.id,
      ).toBe("a");
    }
  });
});

// Klientens halva av den delade urvalstabellen (src/lib/nudge/selection.ts) —
// ändra aldrig den ena motorns readiness utan den andra.
const { READINESS_CASES } = await import(
  "../../src/lib/nudge/selection.cases.js"
);

describe("readiness (delad tabell)", () => {
  // Måste ligga tillräckligt långt efter READINESS_ROLLOUT_AT för att rymma
  // det största daysSinceLastSent-fallet i tabellen (klipp-testet), annars
  // filtreras den konstruerade historiken bort av brytpunkten.
  const rolloutNow = new Date(READINESS_ROLLOUT_AT + 700 * 86_400_000);
  for (const c of READINESS_CASES) {
    it(c.name, () => {
      const a = act("x", c.frequency);
      const history: NudgeRow[] =
        c.daysSinceLastSent === null
          ? []
          : [
              row(
                "x",
                new Date(rolloutNow.getTime() - c.daysSinceLastSent * 86_400_000).toISOString(),
              ),
            ];
      expect(readiness(a, history, DEFAULT_FREQUENCY, rolloutNow)).toBeCloseTo(
        c.expected,
        10,
      );
    });
  }

  it("en sändning FÖRE brytpunkten ignoreras – befintlig aktivitet behandlas som ny (0,5)", () => {
    // Utan brytpunkten skulle en befintlig, kraftigt försenad aktivitet hoppa
    // till maxvikt exakt den dag den här koden går live. En sändning strax
    // FÖRE READINESS_ROLLOUT_AT ska alltså inte räknas som "senast skickad".
    const d = act("d", "D");
    const before = [
      row("d", new Date(READINESS_ROLLOUT_AT - 86_400_000).toISOString()),
    ];
    const soonAfterRollout = new Date(READINESS_ROLLOUT_AT + 86_400_000);
    expect(readiness(d, before, DEFAULT_FREQUENCY, soonAfterRollout)).toBe(0.5);
  });
});

// Serverns halva av den delade schematabellen (src/lib/nudge/schedule.cases.ts).
// Klientens halva finns i src/lib/nudge/schedule.test.ts — ändra aldrig den ena
// utan den andra.

const { SCHEDULE_CASES, REPLAN_CASES, simulateSends, countPerDay } = await import(
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

describe("dygnsräknaren styr omplaneringen (delad tabell)", () => {
  // En omräkning mitt på dagen får aldrig återuppliva en slot som redan gått ut.
  // Se src/lib/nudge/schedule.cases.ts för regeln och bakgrunden.
  for (const c of REPLAN_CASES) {
    it(c.name, () => {
      // 12:00 i Europe/Stockholm: dygnets kvot är delvis förbrukad.
      const nu = new Date("2026-07-01T10:00:00.000Z");
      const schema = weekOf(c.changedTo ?? c.day);
      const nästa = nextTimestamp(nu, schema, TZ, "u1", c.delivered);
      expect(nästa).not.toBeNull();
      expect({ sammaDygn: tzKey(nästa!) === tzKey(nu) }).toEqual({
        sammaDygn: c.sameDay,
      });
    });
  }
});
