import type { DaySchedule, NotificationPrefs } from "@/lib/types";

// Schemaläggning: slumpar fram tidpunkter inom användarens tidsspann per
// veckodag, och avgör om en given tidpunkt är tillåten (inom spann + utanför
// tysta timmar + inte pausad). Rena funktioner med injicerbar RNG.

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Genererar slumpvisa tidpunkter (minuter efter midnatt) för en veckodag,
 * sorterade och glesade så att de inte hamnar ovanpå varandra.
 */
export function randomTimesForDay(
  day: DaySchedule,
  rnd: () => number = Math.random,
): number[] {
  if (!day.enabled || day.nudgesPerDay <= 0) return [];
  const span = Math.max(0, day.endMinutes - day.startMinutes);
  if (span === 0) return [day.startMinutes];

  const n = day.nudgesPerDay;
  // Dela spannet i n lika delar och slumpa en tid inom varje del → jämn
  // spridning utan klumpar, men ändå oförutsägbart.
  const slot = span / n;
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const base = day.startMinutes + i * slot;
    times.push(Math.round(base + rnd() * slot));
  }
  return times.sort((a, b) => a - b);
}

/** Är klockslaget inom de tysta timmarna? Hanterar spann över midnatt. */
export function isQuietHour(
  minutes: number,
  prefs: NotificationPrefs,
): boolean {
  const { quietStartMinutes: s, quietEndMinutes: e } = prefs;
  if (s === e) return false;
  if (s < e) return minutes >= s && minutes < e;
  // spann över midnatt, t.ex. 22:00–07:00
  return minutes >= s || minutes < e;
}

/** Får en nudge skickas vid denna tidpunkt? */
export function mayNudgeAt(
  date: Date,
  day: DaySchedule,
  prefs: NotificationPrefs,
): boolean {
  if (prefs.paused) return false;
  if (!day.enabled) return false;
  const m = minutesOfDay(date);
  if (m < day.startMinutes || m > day.endMinutes) return false;
  if (isQuietHour(m, prefs)) return false;
  return true;
}

/**
 * Nästa tidpunkt (efter `now`) då en nudge ska skickas, givet veckoschemat.
 * Slumpar tidpunkter dag för dag och returnerar första som ligger i framtiden.
 * Returnerar null om inga dagar är aktiverade inom en vecka framåt.
 */
export function nextNudgeTimestamp(
  now: Date,
  schedule: readonly DaySchedule[],
  rnd: () => number = Math.random,
): Date | null {
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = schedule.find((d) => d.weekday === date.getDay());
    if (!day || !day.enabled) continue;
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    for (const minutes of randomTimesForDay(day, rnd)) {
      const candidate = new Date(midnight.getTime() + minutes * 60_000);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return null;
}

export function defaultWeekSchedule(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: true,
    startMinutes: 9 * 60,
    endMinutes: 21 * 60,
    nudgesPerDay: 1,
  }));
}
