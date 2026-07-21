import { db } from "./db.js";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  defaultWeekSchedule,
} from "./nudge.js";

// Databasoperationer, mappade till frontendens camelCase-former så att
// LocalServerStore kan skicka svaren rakt igenom.

export interface ActivityDto {
  id: string;
  userId: string;
  title: string;
  frequency: "A" | "B" | "C" | "D";
  tags: string[];
  imageUrl?: string;
  active: boolean;
  createdAt: string;
}

export interface NudgeDto {
  id: string;
  userId: string;
  activityId: string;
  sentAt: string;
  status: string;
  ackedAt?: string;
  doneAt?: string;
  followUpAskedAt?: string;
}

function activityRow(r: any): ActivityDto {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    frequency: r.frequency,
    tags: JSON.parse(r.tags ?? "[]"),
    imageUrl: r.image_url ?? undefined,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

function nudgeRow(r: any): NudgeDto {
  return {
    id: r.id,
    userId: r.user_id,
    activityId: r.activity_id,
    sentAt: r.sent_at,
    status: r.status,
    ackedAt: r.acked_at ?? undefined,
    doneAt: r.done_at ?? undefined,
    followUpAskedAt: r.follow_up_asked_at ?? undefined,
  };
}

export const repo = {
  listActivities(userId: string): ActivityDto[] {
    return (
      db
        .prepare("select * from activities where user_id = ? order by created_at")
        .all(userId) as any[]
    ).map(activityRow);
  },

  upsertActivity(userId: string, a: ActivityDto) {
    db.prepare(
      `insert into activities (id, user_id, title, frequency, tags, image_url, active, created_at)
       values (@id,@user_id,@title,@frequency,@tags,@image_url,@active,@created_at)
       on conflict(id) do update set
         title=@title, frequency=@frequency, tags=@tags,
         image_url=@image_url, active=@active`,
    ).run({
      id: a.id,
      user_id: userId,
      title: a.title,
      frequency: a.frequency,
      tags: JSON.stringify(a.tags ?? []),
      image_url: a.imageUrl ?? null,
      active: a.active ? 1 : 0,
      created_at: a.createdAt,
    });
  },

  deleteActivity(userId: string, id: string) {
    db.prepare("delete from activities where id = ? and user_id = ?").run(id, userId);
  },

  getKv<T>(userId: string, key: string, fallback: T): T {
    const row = db
      .prepare("select value from kv where user_id = ? and key = ?")
      .get(userId, key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : fallback;
  },

  setKv(userId: string, key: string, value: unknown) {
    db.prepare(
      `insert into kv (user_id, key, value) values (?,?,?)
       on conflict(user_id, key) do update set value = excluded.value`,
    ).run(userId, key, JSON.stringify(value));
  },

  getFrequency: (userId: string) => repo.getKv(userId, "frequency", DEFAULT_FREQUENCY),
  getSchedule: (userId: string) => repo.getKv(userId, "schedule", defaultWeekSchedule()),
  getPrefs: (userId: string) => repo.getKv(userId, "notifPrefs", DEFAULT_NOTIFICATION_PREFS),
  getEngine: (userId: string) => repo.getKv(userId, "engine", { nextNudgeAt: null }),

  listNudges(userId: string): NudgeDto[] {
    // Begränsa till de senaste 1000 – räcker gott för frekvenstak i verklig
    // användning och håller nere payload/rendering (annars kan tusentals rader
    // ackumuleras vid tät testning).
    return (
      db
        .prepare("select * from nudges where user_id = ? order by sent_at desc limit 1000")
        .all(userId) as any[]
    ).map(nudgeRow);
  },

  upsertNudge(userId: string, n: NudgeDto) {
    db.prepare(
      `insert into nudges (id, user_id, activity_id, sent_at, status, acked_at, done_at, follow_up_asked_at)
       values (@id,@user_id,@activity_id,@sent_at,@status,@acked_at,@done_at,@follow_up_asked_at)
       on conflict(id) do update set
         status=@status, acked_at=@acked_at, done_at=@done_at,
         follow_up_asked_at=@follow_up_asked_at`,
    ).run({
      id: n.id,
      user_id: userId,
      activity_id: n.activityId,
      sent_at: n.sentAt,
      status: n.status,
      acked_at: n.ackedAt ?? null,
      done_at: n.doneAt ?? null,
      follow_up_asked_at: n.followUpAskedAt ?? null,
    });
  },

  upsertPushSub(userId: string, sub: { id: string; endpoint: string; keys: unknown }) {
    db.prepare(
      `insert into push_subscriptions (id, user_id, endpoint, keys, created_at)
       values (?,?,?,?,?)
       on conflict(endpoint) do update set keys = excluded.keys`,
    ).run(sub.id, userId, sub.endpoint, JSON.stringify(sub.keys), new Date().toISOString());
  },

  listPushSubs(userId: string) {
    return (
      db.prepare("select * from push_subscriptions where user_id = ?").all(userId) as any[]
    ).map((r) => ({ id: r.id, endpoint: r.endpoint, keys: JSON.parse(r.keys) }));
  },

  /** Alla användar-id vars nästa nudge är due (för motorn). */
  dueUserIds(now: Date): string[] {
    const rows = db.prepare("select user_id, value from kv where key = 'engine'").all() as {
      user_id: string;
      value: string;
    }[];
    return rows
      .filter((r) => {
        const next = JSON.parse(r.value)?.nextNudgeAt;
        return next && new Date(next).getTime() <= now.getTime();
      })
      .map((r) => r.user_id);
  },

  allUserIds(): string[] {
    return (db.prepare("select id from users").all() as { id: string }[]).map((r) => r.id);
  },
};
