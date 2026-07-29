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
 * Stabil "slump" ur en sträng (FNV-1a + mulberry32-steg). Samma nyckel ger alltid
 * samma tal i [0,1). Speglas i server/src/nudge.ts — ändra alltid båda.
 */
export function seededUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = (h + 0x6d2b79f5) | 0;
  let t = h;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Dagens plan måste vara STABIL. Motorn är tillståndslös: efter varje skickad
 * nudge räknas nästa tidpunkt om från "nu". Slumpades tiderna om vid varje
 * omräkning landade en ny tidpunkt senare samma dag ungefär varannan gång →
 * 2–3 nudges på en dag trots "1 per dag". Med ett frö av (användare, datum,
 * slot-index) ger varje omräkning samma plan, och en redan passerad tidpunkt
 * kan aldrig dyka upp igen.
 */
function plannedTimesForDay(
  day: DaySchedule,
  dayKey: string,
  seed: string,
): number[] {
  let i = 0;
  return randomTimesForDay(day, () => seededUnit(`${seed}|${dayKey}|${i++}`));
}

/** Lokal dagnyckel (ÅÅÅÅ-MM-DD) — klientmotorn räknar i webbläsarens tidszon. */
export function localDayKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Nästa tidpunkt (efter `now`) då en nudge ska skickas, givet veckoschemat.
 * Dagens tidpunkter är stabila (se `plannedTimesForDay`) och returneras i tur
 * och ordning; `seed` gör att olika användare får olika tider samma dag.
 * Returnerar null om inga dagar är aktiverade inom en vecka framåt.
 *
 * `deliveredToday` = hur många nudges motorn redan levererat under dygnet. Fröet
 * gör planen stabil givet FASTA indata, men ändras indata mitt i dygnet ritas
 * planen om från noll och en slot som redan gått ut kunde återuppstå senare samma
 * dag → två aktiviteter trots "1 per dag". Räknaren hoppar därför över dygnets
 * förbrukade slots. Se ./schedule.cases.ts (REPLAN_CASES) för reglerna.
 */
export function nextNudgeTimestamp(
  now: Date,
  schedule: readonly DaySchedule[],
  seed = "",
  deliveredToday = 0,
): Date | null {
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = schedule.find((d) => d.weekday === date.getDay());
    if (!day || !day.enabled) continue;
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    // Dygnets förbrukade slots hoppas över (bara idag – i morgon är kvoten hel).
    const planerade = plannedTimesForDay(day, localDayKey(date), seed);
    for (const minutes of offset === 0
      ? planerade.slice(deliveredToday)
      : planerade) {
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
