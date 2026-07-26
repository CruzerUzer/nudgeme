import type { DataStore, EngineState } from "./store";
import { idbCache, type CacheBackend } from "./offlineCache";
import { NetworkError, getUserId as apiUserId } from "@/lib/api";
import type {
  Activity,
  DaySchedule,
  FrequencySettings,
  NotificationPrefs,
  NudgeRecord,
  PushSubscriptionRecord,
} from "@/lib/types";

// Dekorerar en DataStore (i praktiken LocalServerStore) med ett read-through-
// cache-lager. Varje lyckad läsning speglas till IndexedDB, per userId. Vid
// nätfel (NetworkError) serveras senast kända cache istället för att appen ska
// mötas av tomt/defaults. UI-koden är oförändrad — samma DataStore-gränssnitt.
//
// FAS 1: bara läsning. Skrivningar går rakt igenom och failar snällt offline
// (UI:t fångar redan felen). Outbox/optimistiska skrivningar kommer i fas 2.

/** Cache-nyckel per resurs. Måste vara stabil över versioner. */
type Resource =
  | "activities"
  | "frequency"
  | "schedule"
  | "notifPrefs"
  | "nudges"
  | "engine";

function isOffline(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  // Sekundär signal: webbläsaren rapporterar offline men felet inte hann
  // typas (t.ex. abort). Guardat för miljöer utan navigator (tester/node).
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export class OfflineStore implements DataStore {
  constructor(
    private inner: DataStore,
    private cache: CacheBackend = idbCache,
    /** Aktuell användares id för cache-nyckel (localStorage, synkront). */
    private currentUserId: () => string | null = apiUserId,
  ) {}

  /**
   * Läs via servern och spegla till cachen. Vid nätfel: servera cachen om den
   * finns, annars kasta vidare (inget att visa). Andra fel (t.ex. 500, 401)
   * propageras alltid — cachen är bara till för offline.
   */
  private async cachedRead<T>(
    resource: Resource,
    read: () => Promise<T>,
  ): Promise<T> {
    const uid = this.currentUserId();
    try {
      const value = await read();
      // Spegling ska aldrig få läsningen att faila.
      if (uid) void this.cache.put(uid, resource, value).catch(() => undefined);
      return value;
    } catch (err) {
      if (uid && isOffline(err)) {
        const cached = await this.cache.get<T>(uid, resource);
        if (cached !== undefined) return cached;
      }
      throw err;
    }
  }

  getUserId() {
    return this.inner.getUserId();
  }
  isAuthenticated() {
    return this.inner.isAuthenticated();
  }
  async signOut() {
    // Rensa cachen för den utloggade användaren så inget läcker till nästa
    // konto på en delad enhet.
    const uid = this.currentUserId();
    if (uid) await this.cache.clearUser(uid).catch(() => undefined);
    await this.inner.signOut();
  }

  listActivities() {
    return this.cachedRead<Activity[]>("activities", () =>
      this.inner.listActivities(),
    );
  }
  saveActivity(a: Activity) {
    return this.inner.saveActivity(a);
  }
  deleteActivity(id: string) {
    return this.inner.deleteActivity(id);
  }

  getFrequencySettings() {
    return this.cachedRead<FrequencySettings>("frequency", () =>
      this.inner.getFrequencySettings(),
    );
  }
  saveFrequencySettings(s: FrequencySettings) {
    return this.inner.saveFrequencySettings(s);
  }

  getSchedule() {
    return this.cachedRead<DaySchedule[]>("schedule", () =>
      this.inner.getSchedule(),
    );
  }
  saveSchedule(s: DaySchedule[]) {
    return this.inner.saveSchedule(s);
  }

  getNotificationPrefs() {
    return this.cachedRead<NotificationPrefs>("notifPrefs", () =>
      this.inner.getNotificationPrefs(),
    );
  }
  saveNotificationPrefs(p: NotificationPrefs) {
    return this.inner.saveNotificationPrefs(p);
  }

  listNudges() {
    return this.cachedRead<NudgeRecord[]>("nudges", () =>
      this.inner.listNudges(),
    );
  }
  saveNudge(n: NudgeRecord) {
    return this.inner.saveNudge(n);
  }

  getEngineState() {
    return this.cachedRead<EngineState>("engine", () =>
      this.inner.getEngineState(),
    );
  }
  saveEngineState(s: EngineState) {
    return this.inner.saveEngineState(s);
  }

  savePushSubscription(sub: PushSubscriptionRecord) {
    return this.inner.savePushSubscription(sub);
  }
}
