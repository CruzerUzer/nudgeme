// Ren nudge-logik på serversidan (motsvarar frontendens src/lib/nudge/*).
// Håller urval, frekvenstak och schemaläggning på ett ställe för motorn.

export interface Activity {
  id: string;
  title: string;
  frequency: "A" | "B" | "C" | "D";
  active: boolean;
}
export interface NudgeRow {
  id: string;
  activity_id: string;
  sent_at: string;
  status: string;
}
export interface Cap {
  count: number | null; // null = ingen gräns
  windowDays: number;
}
export type FrequencySettings = Record<"A" | "B" | "C" | "D", Cap>;
export interface DaySchedule {
  weekday: number;
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
  nudgesPerDay: number;
}

export const DEFAULT_FREQUENCY: FrequencySettings = {
  A: { count: null, windowDays: 1 },
  B: { count: 1, windowDays: 7 },
  C: { count: 1, windowDays: 30 },
  D: { count: 2, windowDays: 365 },
};

export const DEFAULT_NOTIFICATION_PREFS = {
  level: 2,
  quietStartMinutes: 22 * 60,
  quietEndMinutes: 7 * 60,
  paused: false,
  followUpAfterHours: 6,
};

export function defaultWeekSchedule(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: true,
    startMinutes: 9 * 60,
    endMinutes: 21 * 60,
    nudgesPerDay: 1,
  }));
}

const COUNTS_TOWARD_CAP = new Set(["sent", "acked", "committed", "done", "snoozed"]);
const DAY_MS = 86_400_000;

export function selectEligible(
  activities: Activity[],
  history: NudgeRow[],
  settings: FrequencySettings,
  now: Date,
  rnd: () => number = Math.random,
): Activity | null {
  const eligible = activities.filter((a) => {
    if (!a.active) return false;
    const cap = settings[a.frequency];
    if (!cap || cap.count == null) return true;
    const cutoff = now.getTime() - cap.windowDays * DAY_MS;
    const used = history.filter(
      (h) =>
        h.activity_id === a.id &&
        COUNTS_TOWARD_CAP.has(h.status) &&
        new Date(h.sent_at).getTime() >= cutoff,
    ).length;
    return used < cap.count;
  });
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rnd() * eligible.length)];
}

export function nextTimestamp(
  now: Date,
  days: DaySchedule[],
  rnd: () => number = Math.random,
): Date | null {
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = days.find((d) => d.weekday === date.getDay());
    if (!day?.enabled || day.nudgesPerDay <= 0) continue;
    const span = Math.max(0, day.endMinutes - day.startMinutes);
    const slot = span / day.nudgesPerDay;
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    for (let i = 0; i < day.nudgesPerDay; i++) {
      const minutes = Math.round(day.startMinutes + i * slot + rnd() * slot);
      const candidate = new Date(midnight.getTime() + minutes * 60_000);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return null;
}
