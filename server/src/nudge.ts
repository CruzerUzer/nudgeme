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

// Se readiness() nedan / src/lib/nudge/selection.ts för resonemanget.
export const NEW_ACTIVITY_READINESS = 0.5;
export const MAX_READINESS = 3;

// Två skilda frågor om status — håll dem isär. Att blanda ihop dem var orsaken
// till buggen där en orörd nudge låg kvar i dagar (se CLAUDE.md → Nudge-livscykeln).
/** Visas som "aktuell nudge" i appen. En orörd `sent` hör hit. */
export const VISIBLE_STATUSES: ReadonlySet<string> = new Set([
  "sent",
  "acked",
  "committed",
]);
/**
 * Användaren har aktivt engagerat sig → blockerar en ny nudge tills hon gör
 * klart eller snoozar. En orörd `sent` hör INTE hit: den ersätts när nästa är due.
 */
export const ENGAGED_STATUSES: ReadonlySet<string> = new Set([
  "acked",
  "committed",
]);
/** Auto-ignoreras när en ny nudge föreslås (tjatar aldrig). */
export const AUTO_IGNORED_STATUSES: ReadonlySet<string> = new Set([
  "sent",
  "snoozed",
]);

/**
 * Brytpunkt för readiness-vikten: bara sändningar EFTER detta datum räknas
 * som "senast skickad". Se src/lib/nudge/selection.ts (READINESS_ROLLOUT_AT)
 * för resonemanget — måste vara identisk mellan de två motorerna.
 */
export const READINESS_ROLLOUT_AT = new Date("2026-08-08T00:00:00Z").getTime();

function mostRecentSend(history: NudgeRow[], activityId: string): Date | null {
  let latest: Date | null = null;
  for (const h of history) {
    if (h.activity_id !== activityId) continue;
    if (!COUNTS_TOWARD_CAP.has(h.status)) continue;
    const t = new Date(h.sent_at);
    if (t.getTime() < READINESS_ROLLOUT_AT) continue;
    if (!latest || t > latest) latest = t;
  }
  return latest;
}

/**
 * Hur "redo" en aktivitet är att slumpas, relativt sin egen klasstakt.
 * Frekvensklassen är bara ett TAK (max X ggr/period), ingen garanterad
 * spridning. Uniform slump bland allt under sitt tak lät sällan-aktiviteter
 * (t.ex. klass D, evigt valbara mellan sina två ggr/år) tävla på fullt jämna
 * villkor mot allt annat hela tiden de var valbara, så de dök upp mycket
 * oftare än sin tänkta takt. Se readiness() i src/lib/nudge/selection.ts
 * (klientens motsvarighet) för samma resonemang och delade testfall i
 * src/lib/nudge/selection.cases.ts.
 */
export function readiness(
  activity: Activity,
  history: NudgeRow[],
  settings: FrequencySettings,
  now: Date,
): number {
  const cap = settings[activity.frequency];
  const interval = cap?.count == null ? null : cap.windowDays / cap.count;
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

export function selectEligible(
  activities: Activity[],
  history: NudgeRow[],
  settings: FrequencySettings,
  now: Date,
  rnd: () => number = Math.random,
  exclude?: string,
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
  // Undvik att upprepa exakt samma aktivitet direkt – men bara om det finns
  // något annat att välja (annars hellre en repris än ingen nudge alls).
  const pool =
    exclude && eligible.length > 1
      ? eligible.filter((a) => a.id !== exclude)
      : eligible;
  const weights = pool.map((a) => readiness(a, history, settings, now));
  return weightedPick(pool, weights, rnd);
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

/** Kalenderdygn (ÅÅÅÅ-MM-DD) i tidszonen `tz` — nyckeln dygnsräknaren gäller. */
export function dayKeyIn(date: Date, tz: string = DEFAULT_TZ): string {
  const p = tzParts(date, isValidTz(tz) ? tz : DEFAULT_TZ);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Stabil "slump" ur en sträng (FNV-1a + mulberry32-steg). Samma nyckel ger alltid
 * samma tal i [0,1). Speglas i src/lib/nudge/schedule.ts — ändra alltid båda.
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
 * Nästa nudge-tidpunkt, beräknad i ANVÄNDARENS tidszon (DST-medvetet), inte
 * serverns. `tz` = IANA-namn (t.ex. "Europe/Stockholm").
 *
 * Dagens tidpunkter är STABILA: fröet är (seed, datum, slot-index), så varje
 * omräkning ger samma plan. Motorn är tillståndslös och räknar om nästa tidpunkt
 * efter varje skickad nudge — slumpades tiderna om varje gång landade en ny
 * tidpunkt senare samma dag ungefär varannan gång, och användaren fick 2–3
 * nudges trots "1 per dag". `seed` bör vara userId så att två användare inte får
 * exakt samma tider.
 *
 * `deliveredToday` = hur många nudges motorn redan levererat under dygnet. Fröet
 * gör planen stabil givet FASTA indata, men ändras indata mitt i dygnet (t.ex.
 * när klienten synkar enhetens tidszon) ritas planen om från noll och en slot som
 * redan gått ut kunde återuppstå senare samma dag → två aktiviteter trots "1 per
 * dag". Räknaren hoppar därför över dygnets förbrukade slots. Se
 * src/lib/nudge/schedule.cases.ts (REPLAN_CASES) för reglerna.
 */
export function nextTimestamp(
  now: Date,
  days: DaySchedule[],
  tz: string = DEFAULT_TZ,
  seed = "",
  deliveredToday = 0,
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
    const hopp =
      offset === 0 && slot > 0
        ? Math.max(0, Math.floor((nowMinutes - day.startMinutes) / slot) - 1)
        : 0;
    // Dygnets förbrukade slots hoppas över (bara idag – i morgon är kvoten hel).
    // Är hela kvoten förbrukad blir loopen tom och vi går vidare till nästa dag.
    const iStart = offset === 0 ? Math.max(hopp, deliveredToday) : 0;
    // Fröet innehåller slot-indexet, så hoppet till `iStart` ovan ger samma
    // tider som en genomgång från 0 hade gett (en löpande RNG hade förskjutits).
    const dayKey = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    for (let i = iStart; i < n; i++) {
      const r = seededUnit(`${seed}|${dayKey}|${i}`);
      const minutes = Math.round(day.startMinutes + i * slot + r * slot);
      const candidate = zonedToUtc(y, mo, d, minutes, zone);
      if (candidate.getTime() > nowMs) return candidate;
      if (offset > 0) break; // framtida dag: första sloten räcker
    }
  }
  return null;
}
