// Domänmodell för NudgeMe. Speglar Postgres-schemat i supabase/migrations
// men används också av den lokala (localStorage) datakällan.

/** Frekvensklasser. A = ofta, D = mycket sällan. */
export type FrequencyClass = "A" | "B" | "C" | "D";

/** Synlighetsnivå för notiser, stigande påträngande. */
export type NotificationLevel = 1 | 2 | 3 | 4;

export const NOTIFICATION_LEVELS: Record<
  NotificationLevel,
  { name: string; blurb: string }
> = {
  1: { name: "Viskning", blurb: "Ingen notis alls. Dyker upp tyst i appen." },
  2: {
    name: "Fjärilspost",
    blurb: "Tyst notis utan ljud eller vibration.",
  },
  3: { name: "Notis", blurb: "Syns på telefonen, men tyst." },
  4: { name: "Klar signal", blurb: "Notis med ljud och vibration." },
};

/** Livscykelstatus för en skickad nudge. */
export type NudgeStatus =
  | "sent"
  | "acked"
  | "committed"
  | "done"
  | "ignored"
  | "snoozed";

export interface Activity {
  id: string;
  userId: string;
  title: string;
  description: string;
  frequency: FrequencyClass;
  tags: string[];
  active: boolean;
  createdAt: string;
}

/** Tak per frekvensklass: max `count` gånger per `windowDays`. */
export interface FrequencyCap {
  count: number;
  windowDays: number;
}

export type FrequencySettings = Record<FrequencyClass, FrequencyCap>;

export const DEFAULT_FREQUENCY: FrequencySettings = {
  A: { count: Infinity, windowDays: 1 }, // ingen begränsning
  B: { count: 1, windowDays: 7 }, // max 1/vecka
  C: { count: 1, windowDays: 30 }, // max 1/månad
  D: { count: 2, windowDays: 365 }, // max 2/år
};

/** Ett tidsspann på en veckodag (0 = söndag ... 6 = lördag). */
export interface DaySchedule {
  weekday: number;
  enabled: boolean;
  startMinutes: number; // minuter efter midnatt
  endMinutes: number;
  nudgesPerDay: number;
}

export interface NotificationPrefs {
  level: NotificationLevel;
  quietStartMinutes: number; // tysta timmar (utöver tidsspannet)
  quietEndMinutes: number;
  paused: boolean;
  /** Timmar efter ett "ska göra"-åtagande innan uppföljningsfrågan ställs. */
  followUpAfterHours: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  level: 2,
  quietStartMinutes: 22 * 60,
  quietEndMinutes: 7 * 60,
  paused: false,
  followUpAfterHours: 6,
};

export interface NudgeRecord {
  id: string;
  userId: string;
  activityId: string;
  sentAt: string;
  status: NudgeStatus;
  ackedAt?: string;
  doneAt?: string;
  /** Sätts när uppföljningsfrågan ("hur gick det?") har visats. */
  followUpAskedAt?: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
