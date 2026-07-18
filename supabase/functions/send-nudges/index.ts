// Edge Function: send-nudges
// Körs varje minut av pg_cron (se 0002_cron.sql). Detta är server-sidans
// nudge-motor: den hittar användare vars nästa nudge är "due", väljer en
// kvalificerad aktivitet, loggar den och skickar web push. Speglar
// klientens NudgeService men körs även när ingen har appen öppen.
//
// Miljövariabler (sätt med `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const INVITATIONS = [
  "Psst… en liten idé har landat.",
  "En fjäril viskade just något åt dig.",
  "Ingen brådska, men vad sägs om detta?",
  "En vänlig knuff, inte en spark:",
];

const CAP_COUNTS = new Set(["sent", "acked", "committed", "done", "snoozed"]);
const DAY_MS = 86_400_000;

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:hej@nudgeme.app",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const now = new Date();

  // Användare vars nudge är due.
  const { data: dueUsers } = await supabase
    .from("engine_state")
    .select("user_id, next_nudge_at")
    .lte("next_nudge_at", now.toISOString());

  let sent = 0;
  for (const row of dueUsers ?? []) {
    try {
      const handled = await processUser(supabase, row.user_id, now);
      if (handled) sent++;
    } catch (err) {
      console.error("user", row.user_id, err);
    }
  }

  return new Response(JSON.stringify({ processed: dueUsers?.length ?? 0, sent }), {
    headers: { "content-type": "application/json" },
  });
});

async function processUser(supabase: any, userId: string, now: Date) {
  const { data: prefs } = await supabase
    .from("notification_prefs")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefs?.prefs?.paused) {
    await scheduleNext(supabase, userId, now);
    return false;
  }

  const { data: history } = await supabase
    .from("nudge_history")
    .select("*")
    .eq("user_id", userId);

  // Auto-ignorera en obesvarad tidigare nudge.
  const pending = (history ?? []).find((n: any) => n.status === "sent");
  if (pending) {
    await supabase
      .from("nudge_history")
      .update({ status: "ignored" })
      .eq("id", pending.id);
  }
  // Om användaren redan ackat/committat: skjut bara fram tiden.
  const committed = (history ?? []).find((n: any) =>
    ["acked", "committed"].includes(n.status),
  );
  if (committed) {
    await scheduleNext(supabase, userId, now);
    return false;
  }

  const { data: activities } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);

  const { data: freqRow } = await supabase
    .from("frequency_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = freqRow?.settings ?? {
    A: { count: null, windowDays: 1 },
    B: { count: 1, windowDays: 7 },
    C: { count: 1, windowDays: 30 },
    D: { count: 2, windowDays: 365 },
  };

  const activity = selectEligible(activities ?? [], history ?? [], settings, now);
  if (!activity) {
    await scheduleNext(supabase, userId, now);
    return false;
  }

  const { data: inserted } = await supabase
    .from("nudge_history")
    .insert({
      user_id: userId,
      activity_id: activity.id,
      sent_at: now.toISOString(),
      status: "sent",
    })
    .select()
    .single();

  await pushToUser(supabase, userId, activity, prefs?.prefs?.level ?? 2);
  await scheduleNext(supabase, userId, now);
  return !!inserted;
}

function selectEligible(activities: any[], history: any[], settings: any, now: Date) {
  const eligible = activities.filter((a) => {
    const cap = settings[a.frequency];
    if (!cap || cap.count == null) return true; // ingen gräns
    const cutoff = now.getTime() - cap.windowDays * DAY_MS;
    const used = history.filter(
      (h) =>
        h.activity_id === a.id &&
        CAP_COUNTS.has(h.status) &&
        new Date(h.sent_at).getTime() >= cutoff,
    ).length;
    return used < cap.count;
  });
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

async function pushToUser(supabase: any, userId: string, activity: any, level: number) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  const payload = JSON.stringify({
    title: INVITATIONS[Math.floor(Math.random() * INVITATIONS.length)],
    body: activity.title,
    // Nivå 2 = tyst; 3 = syns men tyst; 4 = ljud/vibration.
    silent: level <= 2,
    vibrate: level >= 4 ? [80, 40, 80] : undefined,
  });

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
      );
    } catch (err: any) {
      // Utgången prenumeration -> städa bort.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
}

async function scheduleNext(supabase: any, userId: string, now: Date) {
  const { data: sched } = await supabase
    .from("schedule")
    .select("days")
    .eq("user_id", userId)
    .maybeSingle();
  const next = nextTimestamp(now, sched?.days ?? []);
  await supabase
    .from("engine_state")
    .upsert({ user_id: userId, next_nudge_at: next?.toISOString() ?? null });
}

function nextTimestamp(now: Date, days: any[]): Date | null {
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = days.find((d) => d.weekday === date.getDay());
    if (!day?.enabled || day.nudgesPerDay <= 0) continue;
    const span = Math.max(0, day.endMinutes - day.startMinutes);
    const slot = span / day.nudgesPerDay;
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    for (let i = 0; i < day.nudgesPerDay; i++) {
      const minutes = Math.round(day.startMinutes + i * slot + Math.random() * slot);
      const candidate = new Date(midnight.getTime() + minutes * 60_000);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return null;
}
