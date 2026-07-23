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

export const DEFAULT_TZ = "Europe/Stockholm";

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Intl-formaterare är dyra att skapa – cacha per tidszon.
const tzFmtCache = new Map<string, Intl.DateTimeFormat>();
function tzFmt(tz: string): Intl.DateTimeFormat {
  let f = tzFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    tzFmtCache.set(tz, f);
  }
  return f;
}

/** Väggklockans delar för `date` i tidszonen `tz`. */
function tzParts(date: Date, tz: string) {
  const o: Record<string, string> = {};
  for (const p of tzFmt(tz).formatToParts(date)) if (p.type !== "literal") o[p.type] = p.value;
  return o;
}

/** UTC-instant för väggklockstid (minuter efter midnatt) på ett kalenderdatum i tz. */
function zonedToUtc(y: number, mo: number, d: number, minutes: number, tz: string): Date {
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = tzParts(new Date(guess), tz);
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = asIfUtc - guess; // tz-offset (ms) vid den tidpunkten
  return new Date(guess - offset);
}

/**
 * Nästa nudge-tidpunkt, beräknad i ANVÄNDARENS tidszon (DST-medvetet), inte
 * serverns. `tz` = IANA-namn (t.ex. "Europe/Stockholm").
 */
export function nextTimestamp(
  now: Date,
  days: DaySchedule[],
  tz: string = DEFAULT_TZ,
  rnd: () => number = Math.random,
): Date | null {
  const zone = isValidTz(tz) ? tz : DEFAULT_TZ;
  const nowMs = now.getTime();
  const base = tzParts(now, zone); // dagens kalenderdatum + väggklocka i användarens tz
  const nowMinutes = +base.hour * 60 + +base.minute + +base.second / 60;
  for (let offset = 0; offset < 8; offset++) {
    // Kalenderdatum + offset dagar (noon-UTC-aritmetik ger säkert datum/veckodag).
    const dd = new Date(Date.UTC(+base.year, +base.month - 1, +base.day + offset, 12));
    const y = dd.getUTCFullYear();
    const mo = dd.getUTCMonth() + 1;
    const d = dd.getUTCDate();
    const day = days.find((x) => x.weekday === dd.getUTCDay());
    if (!day?.enabled || day.nudgesPerDay <= 0) continue;
    const n = day.nudgesPerDay;
    const span = Math.max(0, day.endMinutes - day.startMinutes);
    const slot = n > 0 ? span / n : 0;

    // Prestanda: hoppa direkt till slotten nära `now` idag (annars O(n) med
    // dyra tz-konverteringar per slot – katastrofalt vid stora nudgesPerDay).
    // Framtida dagar räcker det med första sloten (allt ligger efter now).
    const iStart =
      offset === 0 && slot > 0
        ? Math.max(0, Math.floor((nowMinutes - day.startMinutes) / slot) - 1)
        : 0;
    for (let i = iStart; i < n; i++) {
      const minutes = Math.round(day.startMinutes + i * slot + rnd() * slot);
      const candidate = zonedToUtc(y, mo, d, minutes, zone);
      if (candidate.getTime() > nowMs) return candidate;
      if (offset > 0) break; // framtida dag: första sloten räcker
    }
  }
  return null;
}
