// Hjälpare för att gå mellan "minuter efter midnatt" och HH:MM-strängar.

export function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const WEEKDAY_NAMES = [
  "Söndag",
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
];

/** Ordning måndag–söndag för visning (veckodag-index 1..6,0). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
