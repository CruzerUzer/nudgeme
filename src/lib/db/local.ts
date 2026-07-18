import type { DataStore, EngineState } from "./store";
import { SEED_ACTIVITIES } from "./seed";
import { defaultWeekSchedule } from "@/lib/nudge/schedule";
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

// localStorage-baserad datakälla för utveckling och offline-läge.
// JSON kan inte representera Infinity (klass A:s "ingen gräns"), så vi
// serialiserar det som null och återställer vid inläsning.

const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;

function key(userId: string, name: string) {
  return `nudgeme:${userId}:${name}`;
}

function read<T>(k: string, fallback: T): T {
  const raw = localStorage.getItem(k);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(k: string, value: unknown) {
  localStorage.setItem(k, JSON.stringify(value));
}

function serializeFreq(s: FrequencySettings) {
  const out: Record<string, { count: number | null; windowDays: number }> = {};
  for (const cls of Object.keys(s) as (keyof FrequencySettings)[]) {
    const cap = s[cls];
    out[cls] = {
      count: cap.count === Infinity ? null : cap.count,
      windowDays: cap.windowDays,
    };
  }
  return out;
}

function deserializeFreq(
  raw: Record<string, { count: number | null; windowDays: number }>,
): FrequencySettings {
  const out = { ...DEFAULT_FREQUENCY };
  for (const cls of Object.keys(out) as (keyof FrequencySettings)[]) {
    const cap = raw[cls];
    if (cap) {
      out[cls] = {
        count: cap.count == null ? Infinity : cap.count,
        windowDays: cap.windowDays,
      };
    }
  }
  return out;
}

export class LocalStore implements DataStore {
  private userId: string;

  constructor() {
    let id = localStorage.getItem("nudgeme:currentUser");
    if (!id) {
      id = "guest-" + uid();
      localStorage.setItem("nudgeme:currentUser", id);
      this.seed(id);
    }
    this.userId = id;
  }

  private seed(userId: string) {
    const now = new Date().toISOString();
    const activities: Activity[] = SEED_ACTIVITIES.map((s) => ({
      ...s,
      id: uid(),
      userId,
      active: true,
      createdAt: now,
    }));
    write(key(userId, "activities"), activities);
  }

  async getUserId() {
    return this.userId;
  }
  async isAuthenticated() {
    return true; // gästläge är alltid "inloggat" lokalt
  }
  async signOut() {
    localStorage.removeItem("nudgeme:currentUser");
  }

  async listActivities() {
    return read<Activity[]>(key(this.userId, "activities"), []);
  }
  async saveActivity(a: Activity) {
    const all = await this.listActivities();
    const i = all.findIndex((x) => x.id === a.id);
    if (i >= 0) all[i] = a;
    else all.push(a);
    write(key(this.userId, "activities"), all);
  }
  async deleteActivity(id: string) {
    const all = (await this.listActivities()).filter((x) => x.id !== id);
    write(key(this.userId, "activities"), all);
  }

  async getFrequencySettings() {
    const raw = read(key(this.userId, "frequency"), serializeFreq(DEFAULT_FREQUENCY));
    return deserializeFreq(raw);
  }
  async saveFrequencySettings(s: FrequencySettings) {
    write(key(this.userId, "frequency"), serializeFreq(s));
  }

  async getSchedule() {
    return read<DaySchedule[]>(key(this.userId, "schedule"), defaultWeekSchedule());
  }
  async saveSchedule(s: DaySchedule[]) {
    write(key(this.userId, "schedule"), s);
  }

  async getNotificationPrefs() {
    return read<NotificationPrefs>(
      key(this.userId, "notifPrefs"),
      DEFAULT_NOTIFICATION_PREFS,
    );
  }
  async saveNotificationPrefs(p: NotificationPrefs) {
    write(key(this.userId, "notifPrefs"), p);
  }

  async listNudges() {
    return read<NudgeRecord[]>(key(this.userId, "nudges"), []);
  }
  async saveNudge(n: NudgeRecord) {
    const all = await this.listNudges();
    const i = all.findIndex((x) => x.id === n.id);
    if (i >= 0) all[i] = n;
    else all.push(n);
    write(key(this.userId, "nudges"), all);
  }

  async getEngineState() {
    return read<EngineState>(key(this.userId, "engine"), { nextNudgeAt: null });
  }
  async saveEngineState(s: EngineState) {
    write(key(this.userId, "engine"), s);
  }

  async savePushSubscription(sub: PushSubscriptionRecord) {
    // Lokalt läge saknar server att skicka push från — vi sparar ändå
    // prenumerationen så flödet kan testas och kopplas på senare.
    write(key(this.userId, "pushSub"), sub);
  }
}
