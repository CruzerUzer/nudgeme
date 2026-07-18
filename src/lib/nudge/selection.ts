import type {
  Activity,
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

/**
 * Väljer en aktivitet slumpmässigt ur den kvalificerade poolen.
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
  return pool[Math.floor(rnd() * pool.length)];
}
