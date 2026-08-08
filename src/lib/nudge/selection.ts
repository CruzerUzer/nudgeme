import type {
  Activity,
  FrequencyCap,
  FrequencySettings,
  NudgeRecord,
} from "@/lib/types";

// Urvalslogik — helt ren och testbar (ingen I/O, injicerbar RNG och "now").
//
// Frekvenstaket appliceras PER AKTIVITET: varje enskild aktivitet i klass B
// får skickas max 1 gång/vecka osv. En nudge räknas mot taket om den inte
// blev auto-ignorerad — såg du den aldrig "förbrukar" den inte din
// sällan-aktivitet.

const COUNTS_TOWARD_CAP: ReadonlySet<string> = new Set([
  "sent",
  "acked",
  "committed",
  "done",
  "snoozed",
]);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Redo-vikt utan historik: en aktivitet som aldrig skickats startar INTE på
 * toppen av sin klass ramp (det vore "maximalt försenad" från dag ett och
 * skulle ge nya sällan-aktiviteter ett orättvist försprång). Ramp går 0→1
 * över klassens måltid, så en slumpmässig medlem av klassen ligger i snitt på
 * 0,5 — det är läget en ny aktivitet startar på.
 */
export const NEW_ACTIVITY_READINESS = 0.5;

/**
 * Tak på redo-vikten: utan det skulle en aktivitet som blivit kraftigt
 * förbisprungen kunna monopolisera flera dragningar i rad rätt när den väl
 * blir aktuell.
 */
export const MAX_READINESS = 3;

export function countRecentNudges(
  history: readonly NudgeRecord[],
  activityId: string,
  now: Date,
  windowDays: number,
): number {
  const cutoff = now.getTime() - windowDays * DAY_MS;
  let n = 0;
  for (const rec of history) {
    if (rec.activityId !== activityId) continue;
    if (!COUNTS_TOWARD_CAP.has(rec.status)) continue;
    if (new Date(rec.sentAt).getTime() >= cutoff) n++;
  }
  return n;
}

/** Får aktiviteten skickas just nu givet dess frekvensklass och historik? */
export function isEligible(
  activity: Activity,
  settings: FrequencySettings,
  history: readonly NudgeRecord[],
  now: Date,
): boolean {
  if (!activity.active) return false;
  const cap = settings[activity.frequency];
  if (cap.count === Infinity) return true;
  const used = countRecentNudges(history, activity.id, now, cap.windowDays);
  return used < cap.count;
}

export function eligiblePool(
  activities: readonly Activity[],
  settings: FrequencySettings,
  history: readonly NudgeRecord[],
  now: Date,
): Activity[] {
  return activities.filter((a) => isEligible(a, settings, history, now));
}

/** Klassens måltid i dagar (windowDays/count). `null` för klass A (obegränsad). */
function targetIntervalDays(cap: FrequencyCap): number | null {
  return Number.isFinite(cap.count) ? cap.windowDays / cap.count : null;
}

function mostRecentSend(
  history: readonly NudgeRecord[],
  activityId: string,
): Date | null {
  let latest: Date | null = null;
  for (const rec of history) {
    if (rec.activityId !== activityId) continue;
    if (!COUNTS_TOWARD_CAP.has(rec.status)) continue;
    const t = new Date(rec.sentAt);
    if (!latest || t > latest) latest = t;
  }
  return latest;
}

/**
 * Hur "redo" en aktivitet är att slumpas, relativt sin egen klasstakt.
 * Frekvensklassen är bara ett TAK (max X ggr/period) — den garanterar ingen
 * spridning. Uniform slump bland allt som är under sitt tak lät sällan-
 * aktiviteter (t.ex. klass D, evigt valbara mellan sina två ggr/år) tävla på
 * fullt jämna villkor mot allt annat, hela tiden de var valbara — så de dök
 * upp mycket oftare än sin tänkta takt. Vikten här knyter sannolikheten till
 * hur länge sedan aktiviteten skickades, relativt klassens måltid, så att
 * urvalet sprids jämnare över intervallet i stället för att avgöras av hur
 * många andra aktiviteter som råkar vara valbara just nu.
 */
export function readiness(
  activity: Activity,
  settings: FrequencySettings,
  history: readonly NudgeRecord[],
  now: Date,
): number {
  const interval = targetIntervalDays(settings[activity.frequency]);
  if (interval === null) return 1; // klass A: konstant baslinje, ingen ramp
  const last = mostRecentSend(history, activity.id);
  if (!last) return NEW_ACTIVITY_READINESS;
  const daysSince = (now.getTime() - last.getTime()) / DAY_MS;
  return Math.min(MAX_READINESS, Math.max(0, daysSince / interval));
}

function weightedPick<T>(pool: T[], weights: number[], rnd: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(rnd() * pool.length)];
  let r = rnd() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1]; // flyttalssäkerhet
}

/**
 * Väljer en aktivitet ur den kvalificerade poolen, viktad efter `readiness`
 * (se den funktionen för varför ren uniform slump inte räcker).
 * `exclude` låter oss undvika att direkt upprepa samma aktivitet
 * (t.ex. vid "ge mig en annan"). Returnerar null om poolen är tom.
 */
export function selectNudge(
  activities: readonly Activity[],
  settings: FrequencySettings,
  history: readonly NudgeRecord[],
  now: Date,
  rnd: () => number = Math.random,
  exclude?: string,
): Activity | null {
  let pool = eligiblePool(activities, settings, history, now);
  if (exclude && pool.length > 1) {
    pool = pool.filter((a) => a.id !== exclude);
  }
  if (pool.length === 0) return null;
  const weights = pool.map((a) => readiness(a, settings, history, now));
  return weightedPick(pool, weights, rnd);
}
