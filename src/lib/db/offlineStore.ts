import type { DataStore, EngineState } from "./store";
import {
  idbCache,
  idbOutbox,
  type CacheBackend,
  type OutboxBackend,
  type OutboxKind,
  type OutboxOp,
} from "./offlineCache";
import {
  NetworkError,
  AuthError,
  getUserId as apiUserId,
} from "@/lib/api";
import type {
  Activity,
  DaySchedule,
  FrequencySettings,
  NotificationPrefs,
  NudgeRecord,
  PushSubscriptionRecord,
} from "@/lib/types";

// Dekorerar en DataStore (i praktiken LocalServerStore) med offline-stöd:
//
// FAS 1 – läsning: varje lyckad läsning speglas till ett IndexedDB-cache per
//   userId; vid nätfel (NetworkError) serveras senast kända data.
//
// FAS 2 – skrivning: varje mutation uppdaterar cachen optimistiskt (så UI:t
//   reagerar direkt, även offline) och läggs i en outbox. En drain() tömmer
//   kön i FIFO-ordning: online flushas den direkt (rätt ordning, inga race);
//   offline stoppar den och kön spelas upp vid `online`/fokus/appstart.
//   Idempotent tack vare upsert + stabila id:n. "done" är terminal även på
//   servern (repo.upsertNudge), så en sen replay backar aldrig en genomförd
//   nudge.
//
// UI-koden är oförändrad – samma DataStore-gränssnitt via getStore().

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

/** Rank för nudge-status: "done" är terminal och får aldrig backas i cachen. */
function nudgeIsDone(n: NudgeRecord | undefined): boolean {
  return n?.status === "done";
}

export class OfflineStore implements DataStore {
  private draining: Promise<void> | null = null;

  constructor(
    private inner: DataStore,
    private cache: CacheBackend = idbCache,
    private outbox: OutboxBackend = idbOutbox,
    /** Aktuell användares id för cache-/outbox-nyckel (localStorage, synkront). */
    private currentUserId: () => string | null = apiUserId,
  ) {
    // Spela upp ev. kvarvarande kö när nätet kommer tillbaka eller appen får
    // fokus igen. Appstart-drainen körs lazily vid första skrivningen/reload.
    if (typeof window !== "undefined") {
      const kick = () => void this.sync();
      window.addEventListener("online", kick);
      window.addEventListener("focus", kick);
      // Försök tömma en ev. kö från förra sessionen direkt.
      kick();
    }
  }

  /**
   * Spela upp köade offline-skrivningar nu. Kallas av online-/fokus-triggarna
   * och kan anropas manuellt. Sväljer offline/utgången-session (kön ligger kvar
   * och spelas upp senare); andra fel bubblar.
   */
  async sync(): Promise<void> {
    try {
      await this.drain();
    } catch (err) {
      if (!isOffline(err) && !(err instanceof AuthError)) throw err;
    }
  }

  // === Läsning (fas 1) ===

  private async cachedRead<T>(
    resource: Resource,
    read: () => Promise<T>,
  ): Promise<T> {
    const uid = this.currentUserId();
    try {
      const value = await read();
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

  // === Skrivning (fas 2) ===

  /**
   * Optimistisk skrivning: uppdatera cachen lokalt, köa mutationen och försök
   * tömma kön. Online → skrivningen når servern innan vi returnerar (så en
   * efterföljande reload ser rätt serverdata). Offline → stannar i kön och
   * resolvar ändå (UI:t har redan fått den optimistiska uppdateringen).
   */
  private async mutate(
    kind: OutboxKind,
    payload: unknown,
    applyOptimistic: (uid: string) => Promise<void>,
  ): Promise<void> {
    const uid = this.currentUserId();
    if (!uid) {
      // Utan känd användare kan vi varken nyckla cache eller kö – gå direkt.
      return this.dispatch(kind, payload);
    }
    await applyOptimistic(uid);
    await this.outbox.enqueue(uid, kind, payload);
    try {
      await this.drain();
    } catch (err) {
      // Offline eller utgången session: skrivningen ligger tryggt i kön och
      // spelas upp senare. Andra fel bubblar (drain droppar dem själv).
      if (!isOffline(err) && !(err instanceof AuthError)) throw err;
    }
  }

  /** Tömmer outboxen i FIFO-ordning. Single-flight så inga dubbla sändningar. */
  private drain(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.doDrain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async doDrain(): Promise<void> {
    const uid = this.currentUserId();
    if (!uid) return;
    // Loop: läs om kön efter varje tömd batch så ops som köats under tiden
    // (via single-flight-coalescing) också kommer med.
    while (true) {
      const ops = await this.outbox.list(uid);
      if (ops.length === 0) return;
      for (const op of ops) {
        try {
          await this.dispatch(op.kind, op.payload);
        } catch (err) {
          if (isOffline(err) || err instanceof AuthError) {
            // Nät borta / session utgången: behåll kön, avbryt – spelas upp
            // vid nästa online/fokus (eller efter ny inloggning).
            throw err;
          }
          // Servern avvisade (t.ex. 400/409/500): droppa den giftiga opsen så
          // den inte blockerar resten. Last-write-wins gör den oftast ändå
          // överflödig. Logga för felsökning.
          console.warn("Outbox: droppar op som servern avvisade", op.kind, err);
        }
        await this.outbox.remove((op as OutboxOp).seq);
      }
    }
  }

  /** Skickar en outbox-op vidare till den underliggande (server-)storen. */
  private dispatch(kind: OutboxKind, payload: unknown): Promise<void> {
    switch (kind) {
      case "saveActivity":
        return this.inner.saveActivity(payload as Activity);
      case "deleteActivity":
        return this.inner.deleteActivity(payload as string);
      case "saveFrequencySettings":
        return this.inner.saveFrequencySettings(payload as FrequencySettings);
      case "saveSchedule":
        return this.inner.saveSchedule(payload as DaySchedule[]);
      case "saveNotificationPrefs":
        return this.inner.saveNotificationPrefs(payload as NotificationPrefs);
      case "saveNudge":
        return this.inner.saveNudge(payload as NudgeRecord);
      case "saveEngineState":
        return this.inner.saveEngineState(payload as EngineState);
    }
  }

  /** Läs cache, transformera, skriv tillbaka. Ingen cache ⇒ hoppa (inget att visa). */
  private async patchCache<T>(
    uid: string,
    resource: Resource,
    fallback: T,
    fn: (current: T) => T,
  ): Promise<void> {
    const current = (await this.cache.get<T>(uid, resource)) ?? fallback;
    await this.cache.put(uid, resource, fn(current));
  }

  // === DataStore-gränssnittet ===

  getUserId() {
    return this.inner.getUserId();
  }
  isAuthenticated() {
    return this.inner.isAuthenticated();
  }
  async signOut() {
    const uid = this.currentUserId();
    if (uid) {
      // Bäst-möjligt: försök tömma kön innan vi rensar, annars nollställ ändå –
      // isolering mellan konton på en delad enhet väger tyngst.
      await this.drain().catch(() => undefined);
      await this.cache.clearUser(uid).catch(() => undefined);
      await this.outbox.clearUser(uid).catch(() => undefined);
    }
    await this.inner.signOut();
  }

  listActivities() {
    return this.cachedRead<Activity[]>("activities", () =>
      this.inner.listActivities(),
    );
  }
  saveActivity(a: Activity) {
    return this.mutate("saveActivity", a, (uid) =>
      this.patchCache<Activity[]>(uid, "activities", [], (list) => {
        const i = list.findIndex((x) => x.id === a.id);
        if (i >= 0) return list.map((x) => (x.id === a.id ? a : x));
        return [...list, a];
      }),
    );
  }
  deleteActivity(id: string) {
    return this.mutate("deleteActivity", id, (uid) =>
      this.patchCache<Activity[]>(uid, "activities", [], (list) =>
        list.filter((x) => x.id !== id),
      ),
    );
  }

  getFrequencySettings() {
    return this.cachedRead<FrequencySettings>("frequency", () =>
      this.inner.getFrequencySettings(),
    );
  }
  saveFrequencySettings(s: FrequencySettings) {
    return this.mutate("saveFrequencySettings", s, (uid) =>
      this.cache.put(uid, "frequency", s),
    );
  }

  getSchedule() {
    return this.cachedRead<DaySchedule[]>("schedule", () =>
      this.inner.getSchedule(),
    );
  }
  saveSchedule(s: DaySchedule[]) {
    return this.mutate("saveSchedule", s, (uid) =>
      this.cache.put(uid, "schedule", s),
    );
  }

  getNotificationPrefs() {
    return this.cachedRead<NotificationPrefs>("notifPrefs", () =>
      this.inner.getNotificationPrefs(),
    );
  }
  saveNotificationPrefs(p: NotificationPrefs) {
    return this.mutate("saveNotificationPrefs", p, (uid) =>
      this.cache.put(uid, "notifPrefs", p),
    );
  }

  listNudges() {
    return this.cachedRead<NudgeRecord[]>("nudges", () =>
      this.inner.listNudges(),
    );
  }
  saveNudge(n: NudgeRecord) {
    return this.mutate("saveNudge", n, (uid) =>
      this.patchCache<NudgeRecord[]>(uid, "nudges", [], (list) => {
        const existing = list.find((x) => x.id === n.id);
        // Samma guard som servern: en redan genomförd nudge får inte backas
        // optimistiskt (t.ex. av en snooze/ack som råkar spelas upp efteråt).
        if (nudgeIsDone(existing)) return list;
        const i = list.findIndex((x) => x.id === n.id);
        if (i >= 0) return list.map((x) => (x.id === n.id ? n : x));
        return [...list, n];
      }),
    );
  }

  getEngineState() {
    return this.cachedRead<EngineState>("engine", () =>
      this.inner.getEngineState(),
    );
  }
  saveEngineState(s: EngineState) {
    return this.mutate("saveEngineState", s, (uid) =>
      this.cache.put(uid, "engine", s),
    );
  }

  savePushSubscription(sub: PushSubscriptionRecord) {
    // Push-prenumerationen är inte användardata som läses tillbaka via cachen,
    // och kräver en aktiv SW/nät ändå – skicka direkt, ingen kö. syncPush()
    // kör om vid fokus, så ett missat offline-försök hämtas igen.
    return this.inner.savePushSubscription(sub);
  }
}
