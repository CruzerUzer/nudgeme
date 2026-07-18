import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DataStore, EngineState } from "./store";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  type Activity,
  type DaySchedule,
  type FrequencySettings,
  type NotificationPrefs,
  type NudgeRecord,
  type PushSubscriptionRecord,
} from "@/lib/types";
import { defaultWeekSchedule } from "@/lib/nudge/schedule";

// Supabase-backad datakälla (riktig multi-user via Auth + RLS).
// Tabellschemat finns i supabase/migrations/0001_init.sql. Raderna är
// isolerade per användare av Row Level Security, så vi behöver inte filtrera
// på user_id i queries — men vi sätter det vid insert.

export function createSupabaseClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon);
}

export class SupabaseStore implements DataStore {
  constructor(private sb: SupabaseClient) {}

  async getUserId() {
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new Error("Ej inloggad");
    return data.user.id;
  }
  async isAuthenticated() {
    const { data } = await this.sb.auth.getUser();
    return !!data.user;
  }
  async signOut() {
    await this.sb.auth.signOut();
  }

  async listActivities(): Promise<Activity[]> {
    const { data, error } = await this.sb
      .from("activities")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToActivity);
  }
  async saveActivity(a: Activity) {
    const { error } = await this.sb.from("activities").upsert({
      id: a.id,
      user_id: a.userId,
      title: a.title,
      frequency: a.frequency,
      tags: a.tags,
      image_url: a.imageUrl ?? null,
      active: a.active,
      created_at: a.createdAt,
    });
    if (error) throw error;
  }
  async deleteActivity(id: string) {
    const { error } = await this.sb.from("activities").delete().eq("id", id);
    if (error) throw error;
  }

  async getFrequencySettings(): Promise<FrequencySettings> {
    const uid = await this.getUserId();
    const { data } = await this.sb
      .from("frequency_settings")
      .select("settings")
      .eq("user_id", uid)
      .maybeSingle();
    return (data?.settings as FrequencySettings) ?? DEFAULT_FREQUENCY;
  }
  async saveFrequencySettings(s: FrequencySettings) {
    const uid = await this.getUserId();
    // Infinity -> null i JSON; klienten tolkar null som "ingen gräns".
    const safe = JSON.parse(
      JSON.stringify(s, (_k, v) => (v === Infinity ? null : v)),
    );
    const { error } = await this.sb
      .from("frequency_settings")
      .upsert({ user_id: uid, settings: safe });
    if (error) throw error;
  }

  async getSchedule(): Promise<DaySchedule[]> {
    const uid = await this.getUserId();
    const { data } = await this.sb
      .from("schedule")
      .select("days")
      .eq("user_id", uid)
      .maybeSingle();
    return (data?.days as DaySchedule[]) ?? defaultWeekSchedule();
  }
  async saveSchedule(s: DaySchedule[]) {
    const uid = await this.getUserId();
    const { error } = await this.sb
      .from("schedule")
      .upsert({ user_id: uid, days: s });
    if (error) throw error;
  }

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    const uid = await this.getUserId();
    const { data } = await this.sb
      .from("notification_prefs")
      .select("prefs")
      .eq("user_id", uid)
      .maybeSingle();
    return (data?.prefs as NotificationPrefs) ?? DEFAULT_NOTIFICATION_PREFS;
  }
  async saveNotificationPrefs(p: NotificationPrefs) {
    const uid = await this.getUserId();
    const { error } = await this.sb
      .from("notification_prefs")
      .upsert({ user_id: uid, prefs: p });
    if (error) throw error;
  }

  async listNudges(): Promise<NudgeRecord[]> {
    const { data, error } = await this.sb
      .from("nudge_history")
      .select("*")
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToNudge);
  }
  async saveNudge(n: NudgeRecord) {
    const { error } = await this.sb.from("nudge_history").upsert({
      id: n.id,
      user_id: n.userId,
      activity_id: n.activityId,
      sent_at: n.sentAt,
      status: n.status,
      acked_at: n.ackedAt ?? null,
      done_at: n.doneAt ?? null,
      follow_up_asked_at: n.followUpAskedAt ?? null,
    });
    if (error) throw error;
  }

  async getEngineState(): Promise<EngineState> {
    const uid = await this.getUserId();
    const { data } = await this.sb
      .from("engine_state")
      .select("next_nudge_at")
      .eq("user_id", uid)
      .maybeSingle();
    return { nextNudgeAt: data?.next_nudge_at ?? null };
  }
  async saveEngineState(s: EngineState) {
    const uid = await this.getUserId();
    const { error } = await this.sb
      .from("engine_state")
      .upsert({ user_id: uid, next_nudge_at: s.nextNudgeAt });
    if (error) throw error;
  }

  async savePushSubscription(sub: PushSubscriptionRecord) {
    const { error } = await this.sb.from("push_subscriptions").upsert(
      {
        user_id: sub.userId,
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
  }
}

function rowToActivity(r: Record<string, any>): Activity {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    frequency: r.frequency,
    tags: r.tags ?? [],
    imageUrl: r.image_url ?? undefined,
    active: r.active,
    createdAt: r.created_at,
  };
}

function rowToNudge(r: Record<string, any>): NudgeRecord {
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
