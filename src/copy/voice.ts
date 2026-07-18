// NudgeMe:s röst bor här. Det vackra/alviska sitter i det visuella —
// humorn och värmen sitter i texten. Ton: vänlig alv med glimten i ögat,
// aldrig tjatig, aldrig skuldbeläggande. Byt fritt, det är själen i appen.

export function pick<T>(arr: readonly T[], rnd: () => number = Math.random): T {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Inbjudningar som visas när en ny nudge dyker upp. */
export const NUDGE_INVITATIONS = [
  "Psst… en liten idé har landat.",
  "Om du känner för det – här är en tanke.",
  "En fjäril viskade just något åt dig.",
  "Skogen föreslår försiktigt…",
  "Ingen brådska, men vad sägs om detta?",
  "En vänlig knuff, inte en spark:",
  "Din framtida jag skickade en hälsning:",
] as const;

/** Bekräftelse när något markeras som genomfört. Fira, aldrig kräva. */
export const DONE_CHEERS = [
  "Där satt den! ✨",
  "Skogen jublar diskret.",
  "En stjärna till i din krona.",
  "Underbart. Du får en osynlig high-five.",
  "Bra jobbat.",
  "Det där var värt en liten dans.",
] as const;

/** När uppföljningsfrågan ställs efter ett åtagande. Mjukt, aldrig anklagande. */
export const FOLLOWUP_PROMPTS = [
  "Hur gick det med den där lilla grejen?",
  "Blev det något av det? Inget rätt eller fel svar.",
  "Bara nyfiken – hann du med det?",
] as const;

/** Tomt tillstånd i aktivitetslistan. */
export const EMPTY_ACTIVITIES = [
  "Här var det tomt som en alvskog i gryningen. Lägg till något du gärna glömmer bort att göra!",
] as const;

/** Tomt tillstånd i historiken. */
export const EMPTY_HISTORY = [
  "Din historia väntar på sitt första kapitel.",
] as const;

/** När appen är pausad. */
export const PAUSED_MESSAGE =
  "Allt är stilla. Nudges vilar tills du väcker dem igen. 🍃";

/** Knapptexter — små men viktiga för tonen. */
export const LABELS = {
  ack: "Jag ser den",
  commit: "Ja, jag gör det",
  done: "Klart!",
  snooze: "Inte just nu",
  another: "Ge mig en annan",
  surprise: "Överraska mig",
  addActivity: "Ny aktivitet",
  pause: "Pausa allt",
  resume: "Väck skogen",
} as const;
