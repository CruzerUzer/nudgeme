// Delad scenariotabell för SCHEMALÄGGNINGEN (hur många nudges en dag ger).
//
// Precis som livscykeln (se ./lifecycle.cases.ts) finns schemaläggningen
// implementerad TVÅ gånger: klientens `nextNudgeTimestamp` (./schedule.ts) och
// serverns `nextTimestamp` (server/src/nudge.ts). De måste ge samma antal nudges
// per dygn. Fallen körs mot båda:
//   klient → src/lib/nudge/schedule.test.ts
//   server → server/src/nudge.test.ts
//
// Bakgrund: motorn är tillståndslös mellan tick:ar. Efter varje skickad nudge
// räknas nästa tidpunkt om från "nu" — slumpades tidpunkterna om vid varje
// omräkning hamnade en ny tidpunkt senare samma dag i ungefär hälften av fallen,
// och användaren fick 2–3 nudges på en dag trots "1 per dag". Dagens tidpunkter
// måste därför vara STABILA: samma dygn ska alltid ge samma plan.
//
// Filen får medvetet inte ha några imports — den läses av två skilda tsconfigs.

export interface CaseDay {
  startMinutes: number;
  endMinutes: number;
  nudgesPerDay: number;
}

export interface ScheduleCase {
  name: string;
  /** Samma inställning för alla veckodagar. */
  day: CaseDay;
  /** Antal dygn att simulera. */
  days: number;
}

export const SCHEDULE_CASES: ScheduleCase[] = [
  {
    name: "1 per dag ger exakt 1 nudge per dygn",
    day: { startMinutes: 9 * 60, endMinutes: 21 * 60, nudgesPerDay: 1 },
    days: 14,
  },
  {
    name: "3 per dag ger exakt 3 nudges per dygn",
    day: { startMinutes: 8 * 60, endMinutes: 22 * 60, nudgesPerDay: 3 },
    days: 7,
  },
  {
    name: "smalt tidsspann (11:00–12:00) spiller inte över",
    day: { startMinutes: 11 * 60, endMinutes: 12 * 60, nudgesPerDay: 2 },
    days: 7,
  },
];

/**
 * Dygnsräknaren: hur många nudges som redan levererats under dygnet styr vilka
 * slots som återstår. Utan den kunde en omräkning mitt på dagen — t.ex. när
 * klienten synkar enhetens tidszon — rita om planen från noll och återuppliva en
 * slot som redan gått ut, så användaren fick två aktiviteter trots "1 per dag".
 * Fröet gör planen stabil givet FASTA indata; räknaren håller taket även när
 * indata ändras mitt i dygnet.
 *
 * Adams beslut (ersätter det tidigare "ett ändrat schema får ge en extra nudge
 * samma dag"): räknaren nollställs ALDRIG mitt i ett dygn, inte heller av en
 * schemaändring. Höjer användaren antalet per dag kommer resten av kvoten direkt;
 * sänker hon det under räknarens värde blir dygnet bara tyst resten av dagen.
 */
export interface ReplanCase {
  name: string;
  /** Schemat som gällde när dygnets nudges gick ut. */
  day: CaseDay;
  /** Antal nudges motorn redan levererat under dygnet. */
  delivered: number;
  /** Schemat vid omräkningen (utelämnat = oförändrat). */
  changedTo?: CaseDay;
  /** Ska nästa tidpunkt ligga kvar samma dygn? */
  sameDay: boolean;
}

const SPAN = { startMinutes: 9 * 60, endMinutes: 21 * 60 };

export const REPLAN_CASES: ReplanCase[] = [
  {
    // Kärnfallet: tidszonssynken (PUT /timezone) räknade om planen och gav en
    // andra aktivitet samma dag fast användaren inte bett om något.
    name: "omräkning mitt på dagen ger inget nytt när dygnets kvot är förbrukad",
    day: { ...SPAN, nudgesPerDay: 1 },
    delivered: 1,
    sameDay: false,
  },
  {
    name: "oförbrukad kvot ligger kvar samma dygn",
    day: { ...SPAN, nudgesPerDay: 3 },
    delivered: 1,
    sameDay: true,
  },
  {
    name: "höjt antal per dag gäller direkt och ger resten av kvoten idag",
    day: { ...SPAN, nudgesPerDay: 1 },
    delivered: 1,
    changedTo: { ...SPAN, nudgesPerDay: 3 },
    sameDay: true,
  },
  {
    name: "sänkt antal under räknaren tystnar resten av dygnet",
    day: { ...SPAN, nudgesPerDay: 3 },
    delivered: 2,
    changedTo: { ...SPAN, nudgesPerDay: 1 },
    sameDay: false,
  },
  {
    // Ett ändrat schema gäller fortfarande DIREKT så länge kvoten är kvar —
    // det halva av Adams gamla beslut som står kvar.
    name: "flyttat tidsspann gäller direkt när inget gått ut ännu",
    day: { ...SPAN, nudgesPerDay: 1 },
    delivered: 0,
    changedTo: { startMinutes: 18 * 60, endMinutes: 21 * 60, nudgesPerDay: 1 },
    sameDay: true,
  },
  {
    name: "flyttat tidsspann återupplivar inte en förbrukad kvot",
    day: { ...SPAN, nudgesPerDay: 1 },
    delivered: 1,
    changedTo: { startMinutes: 18 * 60, endMinutes: 21 * 60, nudgesPerDay: 1 },
    sameDay: false,
  },
];

/**
 * Simulerar motorns loop: skicka vid nästa tidpunkt, räkna om nästa därifrån,
 * osv. Returnerar tidpunkterna för de nudges som skulle ha skickats.
 *
 * `next` är motorns schemafunktion (klientens eller serverns).
 */
export function simulateSends(
  next: (now: Date) => Date | null,
  from: Date,
  days: number,
): Date[] {
  const until = from.getTime() + days * 86_400_000;
  const sends: Date[] = [];
  let now = from;
  // Taket är bara ett skydd mot evig loop om en motor skulle returnera samma
  // tidpunkt om och om igen — normalfallet avslutas av `until`.
  for (let guard = 0; guard < 10_000; guard++) {
    const at = next(now);
    if (!at || at.getTime() > until) break;
    if (at.getTime() <= now.getTime()) {
      throw new Error("schemafunktionen returnerade en tidpunkt som inte är i framtiden");
    }
    sends.push(at);
    now = at;
  }
  return sends;
}

/** Antal nudges per dagnyckel, givet en nyckelfunktion (lokal tid resp. tz). */
export function countPerDay(
  sends: Date[],
  dayKey: (d: Date) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sends) {
    const k = dayKey(s);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
