// Delad scenariotabell för REDO-VIKTEN i aktivitetsurvalet (`readiness`).
//
// Precis som livscykeln (./lifecycle.cases.ts) och schemaläggningen
// (./schedule.cases.ts) finns urvalslogiken implementerad TVÅ gånger:
// klientens `readiness` (./selection.ts) och serverns `readiness`
// (server/src/nudge.ts). Fallen körs mot båda:
//   klient → src/lib/nudge/selection.test.ts
//   server → server/src/nudge.test.ts
//
// Bakgrund: frekvensklassen (A–D) är bara ett TAK (max X ggr/period) — den
// garanterar ingen spridning. Ren uniform slump bland allt som är under sitt
// tak lät sällan-aktiviteter (t.ex. klass D, valbara i princip hela tiden
// mellan sina två ggr/år) tävla på fullt jämna villkor mot allt annat, så de
// dök upp mycket oftare än sin tänkta takt. `readiness` viktar i stället
// sannolikheten efter hur länge sedan aktiviteten skickades, relativt
// klassens måltid (windowDays/count):
//   - Klass A (obegränsad): konstant vikt 1, ingen ramp.
//   - Ingen historik: 0,5 — INTE toppen av rampen (1) och inte oändligt. En
//     ny aktivitet ska inte tävla som om den vore maximalt försenad från dag
//     ett (det gav nya sällan-aktiviteter ett orättvist försprång); 0,5 är
//     snittet av klassens 0→1-ramp, dvs en "genomsnittlig" nytillkommen
//     medlem av klassen.
//   - Annars: min(MAX_READINESS, dagar sedan senast / måltid) — 1 exakt på
//     måltiden, växer däröver (självkorrigerande om den blir förbisprungen),
//     men taket (MAX_READINESS = 3) hindrar en kraftigt försenad aktivitet
//     från att monopolisera flera dragningar i rad.
//
// Filen får medvetet inte ha några imports — den läses av två skilda
// tsconfigs. `expected` måste matcha NEW_ACTIVITY_READINESS/MAX_READINESS så
// som de faktiskt är satta i BÅDA motorerna (0,5 respektive 3) — ändras
// konstanterna i den ena motorn utan den andra blir dessa fall röda för just
// den motorn.

export type CaseFrequency = "A" | "B" | "C" | "D";

export interface ReadinessCase {
  name: string;
  frequency: CaseFrequency;
  /** Dagar sedan senaste skickade (räknade) nudge. `null` = aldrig skickad. */
  daysSinceLastSent: number | null;
  expected: number;
}

export const READINESS_CASES: ReadinessCase[] = [
  {
    name: "klass A är konstant redo utan historik",
    frequency: "A",
    daysSinceLastSent: null,
    expected: 1,
  },
  {
    name: "klass A förblir konstant redo oavsett hur länge sedan",
    frequency: "A",
    daysSinceLastSent: 500,
    expected: 1,
  },
  {
    name: "ny B-aktivitet utan historik startar på klassens snitt (0,5), inte på toppen",
    frequency: "B",
    daysSinceLastSent: null,
    expected: 0.5,
  },
  {
    // Regressionsfall: kärnfrågan var om en ny SÄLLAN-aktivitet (lång måltid)
    // skulle få ett orättvist försprång genom att starta "maximalt försenad".
    // Den ska starta på samma 0,5 som alla andra klasser, inte högre.
    name: "ny D-aktivitet (mycket sällan) startar också bara på 0,5, inte oändligt eller på klassens tak",
    frequency: "D",
    daysSinceLastSent: null,
    expected: 0.5,
  },
  {
    name: "nyss skickad B-aktivitet har lägst möjliga vikt",
    frequency: "B",
    daysSinceLastSent: 0,
    expected: 0,
  },
  {
    name: "B-aktivitet exakt på sin måltid (7 dagar) väger 1",
    frequency: "B",
    daysSinceLastSent: 7,
    expected: 1,
  },
  {
    name: "C-aktivitet halvvägs till sin måltid (15 av 30 dagar) väger 0,5",
    frequency: "C",
    daysSinceLastSent: 15,
    expected: 0.5,
  },
  {
    name: "kraftigt förbisprungen D-aktivitet taks vid MAX_READINESS (3) i stället för att växa obegränsat",
    frequency: "D",
    // måltid 182,5 dagar → ratio ~3,29 utan tak. Hålls lågt (i stället för
    // t.ex. flera år) så testfilernas "now" för det här blocket inte behöver
    // ligga orimligt långt efter READINESS_ROLLOUT_AT (se selection.ts).
    daysSinceLastSent: 600,
    expected: 3,
  },
];
