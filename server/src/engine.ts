import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { repo } from "./repo.js";
import { selectEligible, nextTimestamp, type Activity, type NudgeRow } from "./nudge.js";

// Serverns nudge-motor. Kör periodiskt (tick) och genererar nudges enligt varje
// användares schema. Motsvarar frontendens NudgeService men är den enda källan
// som genererar schemalagda nudges i serverläge (klienten bara läser/kvitterar).

const PENDING = new Set(["sent", "acked", "committed"]);

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

function reschedule(userId: string, now: Date) {
  const days = repo.getSchedule(userId) as any[];
  const next = nextTimestamp(now, days);
  repo.setKv(userId, "engine", { nextNudgeAt: next ? next.toISOString() : null });
}

function generate(userId: string, now: Date): boolean {
  const activities = repo.listActivities(userId) as unknown as Activity[];
  const history = repo.listNudges(userId).map(
    (n): NudgeRow => ({ id: n.id, activity_id: n.activityId, sent_at: n.sentAt, status: n.status }),
  );
  // Endast en snoozad i taget: äldre snoozad blir ignorerad när ny föreslås.
  for (const n of repo.listNudges(userId)) {
    if (n.status === "snoozed") repo.upsertNudge(userId, { ...n, status: "ignored" });
  }
  const settings = repo.getFrequency(userId) as any;
  const activity = selectEligible(activities, history, settings, now);
  if (!activity) return false;

  repo.upsertNudge(userId, {
    id: randomUUID(),
    userId,
    activityId: activity.id,
    sentAt: now.toISOString(),
    status: "sent",
  });
  void pushToUser(userId, activity.title);
  return true;
}

async function pushToUser(userId: string, title: string) {
  if (!pushReady) return;
  const prefs = repo.getPrefs(userId) as any;
  const subs = repo.listPushSubs(userId);
  const payload = JSON.stringify({
    title: "En vänlig knuff",
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

function processUser(userId: string, now: Date) {
  const prefs = repo.getPrefs(userId) as any;
  if (prefs.paused) {
    reschedule(userId, now);
    return;
  }
  const nudges = repo.listNudges(userId);
  const pendingSent = nudges.find((n) => n.status === "sent");
  if (pendingSent) repo.upsertNudge(userId, { ...pendingSent, status: "ignored" });

  const committed = nudges.find((n) => n.status === "acked" || n.status === "committed");
  if (committed) {
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

export function startEngine(intervalMs = 60_000) {
  tick();
  return setInterval(() => tick(), intervalMs);
}
