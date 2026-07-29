import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { repo } from "./repo.js";
import {
  selectEligible,
  nextTimestamp,
  dayKeyIn,
  AUTO_IGNORED_STATUSES,
  ENGAGED_STATUSES,
  VISIBLE_STATUSES,
  type Activity,
  type DaySchedule,
  type NudgeRow,
} from "./nudge.js";

// Serverns nudge-motor. Kör periodiskt (tick) och genererar nudges enligt varje
// användares schema. Motsvarar frontendens NudgeService men är den enda källan
// som genererar schemalagda nudges i serverläge (klienten bara läser/kvitterar).
// Livscykelreglerna delas med klientmotorn via scenariotabellen i
// src/lib/nudge/lifecycle.cases.ts — ändra aldrig den ena motorn utan den andra.

let pushReady = false;
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:hej@nudgeme.local",
    vapidPublic,
    vapidPrivate,
  );
  pushReady = true;
}

/** Motorns bokföring i kv: nästa tidpunkt + dygnets levererade kvot. */
interface EngineKv {
  nextNudgeAt: string | null;
  sentDayKey?: string | null;
  sentCount?: number;
}

/** Dygnets förbrukade kvot — 0 så fort räknaren gäller ett annat dygn. */
function deliveredToday(st: EngineKv, dayKey: string): number {
  return st.sentDayKey === dayKey ? (st.sentCount ?? 0) : 0;
}

/** Veckodag (0 = söndag) för en dagnyckel. Noon-UTC undviker offsetkanterna. */
function weekdayOf(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00Z`).getUTCDay();
}

/**
 * Räkna om nästa tidpunkt. ENDA stället som får skriva `nextNudgeAt` — routerna
 * i index.ts (PUT /schedule, PUT /timezone) kallar hit i stället för att göra sin
 * egen omräkning. De hade varsin kopia, och kopian i tidszonsrouten tappade
 * dygnsräknaren: planen ritades om från noll och en redan levererad slot kunde
 * återuppstå senare samma dag (två aktiviteter trots "1 per dag").
 */
export function reschedule(userId: string, now: Date) {
  const days = repo.getSchedule(userId) as any[];
  const tz = repo.getTimeZone(userId);
  const st = repo.getEngine(userId) as EngineKv;
  const dayKey = dayKeyIn(now, tz);
  const levererade = deliveredToday(st, dayKey);
  // userId som frö → varje användare får sina egna tider på dygnet.
  const next = nextTimestamp(now, days, tz, userId, levererade);
  repo.setKv(userId, "engine", {
    nextNudgeAt: next ? next.toISOString() : null,
    sentDayKey: dayKey,
    sentCount: levererade,
  });
}

function generate(userId: string, now: Date): boolean {
  const activities = repo.listActivities(userId) as unknown as Activity[];
  const rows = repo.listNudges(userId);
  const history = rows.map(
    (n): NudgeRow => ({ id: n.id, activity_id: n.activityId, sent_at: n.sentAt, status: n.status }),
  );
  // listNudges är sorterad nyast först → [0] är den nudge som just ersätts.
  const prevActivityId = history[0]?.activity_id;
  // En orörd nudge tjatar aldrig: en tidigare "sent" (aldrig ackad) och en
  // snoozad blir automatiskt ignorerade när en ny föreslås. Aktivt engagerade
  // (committed/acked) rörs inte här – de blockerar redan i processUser.
  for (const n of rows) {
    if (AUTO_IGNORED_STATUSES.has(n.status)) {
      repo.upsertNudge(userId, { ...n, status: "ignored" });
    }
  }
  // Urvalet måste se historiken EFTER auto-ignoreringen: en nudge du aldrig såg
  // ska inte förbruka frekvenstaket. Med den gamla (lästa) historiken räknades
  // den nyss ignorerade som "sent" och åt upp taket, vilket kunde tömma poolen
  // helt när bara en aktivitet var valbar → varannan nudge uteblev.
  const effective = history.map((h) =>
    AUTO_IGNORED_STATUSES.has(h.status) ? { ...h, status: "ignored" } : h,
  );
  const settings = repo.getFrequency(userId) as any;
  const activity = selectEligible(activities, effective, settings, now, Math.random, prevActivityId);
  if (!activity) return false;

  repo.upsertNudge(userId, {
    id: randomUUID(),
    userId,
    activityId: activity.id,
    sentAt: now.toISOString(),
    status: "sent",
  });
  // Bokför mot dygnets kvot. Allt motorn levererar räknas — även välkomstnudgen
  // och admin-testet — annars kan en omplanering ge en extra aktivitet samma dag.
  const tz = repo.getTimeZone(userId);
  const dayKey = dayKeyIn(now, tz);
  const st = repo.getEngine(userId) as EngineKv;
  repo.setKv(userId, "engine", {
    ...st,
    sentDayKey: dayKey,
    sentCount: deliveredToday(st, dayKey) + 1,
  });
  void pushToUser(userId, activity.title);
  return true;
}

async function pushToUser(userId: string, title: string) {
  if (!pushReady) return;
  const prefs = repo.getPrefs(userId) as any;
  if ((prefs.level ?? 2) <= 1) return; // nivå 1 (Viskning) = ingen push
  const subs = repo.listPushSubs(userId);
  const payload = JSON.stringify({
    title: "Dags för en aktivitet",
    body: title,
    silent: prefs.level <= 2,
    vibrate: prefs.level >= 4 ? [80, 40, 80] : undefined,
  });
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys as any }, payload);
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        // utgången prenumeration – lämna städning till senare
      }
    }
  }
}

/** Ge ett nytt konto en välkomnande första nudge direkt (som frontendens first-run). */
export function initUserEngine(userId: string, now = new Date()) {
  generate(userId, now);
  reschedule(userId, now);
}

/**
 * Tvinga fram en ny aktivitet + pushnotis NU (admin-test). Ignorerar ev.
 * väntande så testet alltid ger en ny aktuell aktivitet.
 *
 * Testet får varken förbruka dygnets kvot eller flytta nästa tidpunkt: motorns
 * bokföring läses av före, och läggs tillbaka oförändrad efteråt. Utan
 * återställningen skulle ett push-test kl 09 tyst äta upp dagens riktiga nudge —
 * `generate` räknar upp kvoten som för vilken levererad aktivitet som helst.
 *
 * Returnerar även dygnets kvotläge så admin ser vad testet INTE rörde.
 */
export function triggerNudge(userId: string, now = new Date()) {
  const före = repo.getEngine(userId) as EngineKv;
  const tz = repo.getTimeZone(userId);
  const dayKey = dayKeyIn(now, tz);
  const delivered = deliveredToday(före, dayKey);
  const days = repo.getSchedule(userId) as DaySchedule[];
  const planned = days.find((d) => d.weekday === weekdayOf(dayKey))?.nudgesPerDay ?? 0;

  for (const n of repo.listNudges(userId)) {
    if (VISIBLE_STATUSES.has(n.status)) {
      repo.upsertNudge(userId, { ...n, status: "ignored" });
    }
  }
  const created = generate(userId, now); // skickar även push inuti
  repo.setKv(userId, "engine", före); // lägg tillbaka kvot + nästa tidpunkt

  const prefs = repo.getPrefs(userId) as any;
  const pushed =
    pushReady && (prefs.level ?? 2) > 1 && repo.listPushSubs(userId).length > 0;
  return { created, pushed, delivered, planned };
}

function processUser(userId: string, now: Date) {
  const prefs = repo.getPrefs(userId) as any;
  if (prefs.paused) {
    reschedule(userId, now);
    return;
  }
  // En nudge som användaren engagerat sig i (acked/committed) ska ligga kvar
  // tills hon gör klart eller snoozar – ingen ny byter ut den, vi skjuter bara
  // fram nästa kontroll. En orörd "sent" räknas INTE som aktiv: den ersätts av
  // en ny när nästa är due (generate auto-ignorerar den).
  const nudges = repo.listNudges(userId);
  const engaged = nudges.find((n) => ENGAGED_STATUSES.has(n.status));
  if (engaged) {
    reschedule(userId, now);
    return;
  }
  generate(userId, now);
  reschedule(userId, now);
}

/** Ett varv av motorn: hantera alla användare vars nudge är due. */
export function tick(now = new Date()) {
  for (const userId of repo.dueUserIds(now)) {
    try {
      processUser(userId, now);
    } catch (err) {
      console.error("engine tick user", userId, err);
    }
  }
}

export function startEngine(intervalMs = Number(process.env.TICK_MS) || 60_000) {
  tick();
  return setInterval(() => tick(), intervalMs);
}
