import type { DataStore, EngineState } from "./store";
import { apiFetch, getUserId, clearSession } from "@/lib/api";
import {
  DEFAULT_FREQUENCY,
  type Activity,
  type DaySchedule,
  type FrequencySettings,
  type NotificationPrefs,
  type NudgeRecord,
  type PushSubscriptionRecord,
} from "@/lib/types";

// DataStore mot den lokala servern (SQLite + auth). Servern äger genereringen
// av schemalagda nudges; klienten läser och kvitterar. Frekvenstaket för klass
// A använder Infinity i klienten men null ("ingen gräns") över nätet.

function freqToWire(s: FrequencySettings) {
  return JSON.parse(JSON.stringify(s, (_k, v) => (v === Infinity ? null : v)));
}
function freqFromWire(raw: any): FrequencySettings {
  const out = { ...DEFAULT_FREQUENCY };
  for (const cls of Object.keys(out) as (keyof FrequencySettings)[]) {
    const cap = raw?.[cls];
    if (cap) {
      out[cls] = {
        count: cap.count == null ? Infinity : cap.count,
        windowDays: cap.windowDays,
      };
    }
  }
  return out;
}

export class LocalServerStore implements DataStore {
  async getUserId() {
    const id = getUserId();
    if (!id) throw new Error("Ej inloggad");
    return id;
  }
  async isAuthenticated() {
    return !!getUserId();
  }
  async signOut() {
    clearSession();
  }

  listActivities() {
    return apiFetch<Activity[]>("/api/activities");
  }
  async saveActivity(a: Activity) {
    await apiFetch("/api/activities", { method: "POST", body: JSON.stringify(a) });
  }
  async deleteActivity(id: string) {
    await apiFetch(`/api/activities/${id}`, { method: "DELETE" });
  }

  async getFrequencySettings() {
    return freqFromWire(await apiFetch("/api/frequency"));
  }
  async saveFrequencySettings(s: FrequencySettings) {
    await apiFetch("/api/frequency", {
      method: "PUT",
      body: JSON.stringify(freqToWire(s)),
    });
  }

  getSchedule() {
    return apiFetch<DaySchedule[]>("/api/schedule");
  }
  async saveSchedule(s: DaySchedule[]) {
    await apiFetch("/api/schedule", { method: "PUT", body: JSON.stringify(s) });
  }

  getNotificationPrefs() {
    return apiFetch<NotificationPrefs>("/api/notification-prefs");
  }
  async saveNotificationPrefs(p: NotificationPrefs) {
    await apiFetch("/api/notification-prefs", {
      method: "PUT",
      body: JSON.stringify(p),
    });
  }

  listNudges() {
    return apiFetch<NudgeRecord[]>("/api/nudges");
  }
  async saveNudge(n: NudgeRecord) {
    await apiFetch("/api/nudges", { method: "POST", body: JSON.stringify(n) });
  }

  getEngineState() {
    return apiFetch<EngineState>("/api/engine");
  }
  async saveEngineState(s: EngineState) {
    await apiFetch("/api/engine", { method: "PUT", body: JSON.stringify(s) });
  }

  async savePushSubscription(sub: PushSubscriptionRecord) {
    await apiFetch("/api/push-subscriptions", {
      method: "POST",
      body: JSON.stringify(sub),
    });
  }
}
