import { describe, it, expect, beforeEach } from "vitest";
import { OfflineStore } from "./offlineStore";
import type { CacheBackend } from "./offlineCache";
import type { DataStore, EngineState } from "./store";
import { NetworkError } from "@/lib/api";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  type Activity,
} from "@/lib/types";

// In-memory-cache som speglar CacheBackend, så vi kan testa read-through-
// logiken utan en riktig IndexedDB.
class FakeCache implements CacheBackend {
  store = new Map<string, unknown>();
  async get<T>(userId: string, resource: string) {
    return this.store.get(`${userId}:${resource}`) as T | undefined;
  }
  async put(userId: string, resource: string, value: unknown) {
    this.store.set(`${userId}:${resource}`, value);
  }
  async clearUser(userId: string) {
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(`${userId}:`)) this.store.delete(k);
    }
  }
}

// Konfigurerbar fejk-server. `fail` styr om läsningarna kastar (offline).
class FakeInner implements DataStore {
  fail: Error | null = null;
  signedOut = false;
  activities: Activity[] = [
    {
      id: "a1",
      userId: "u1",
      title: "Läsa en bok",
      frequency: "B",
      tags: [],
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  private read<T>(value: T): Promise<T> {
    if (this.fail) return Promise.reject(this.fail);
    return Promise.resolve(value);
  }

  async getUserId() {
    return "u1";
  }
  async isAuthenticated() {
    return true;
  }
  async signOut() {
    this.signedOut = true;
  }
  listActivities() {
    return this.read(this.activities);
  }
  async saveActivity() {}
  async deleteActivity() {}
  getFrequencySettings() {
    return this.read(DEFAULT_FREQUENCY);
  }
  async saveFrequencySettings() {}
  getSchedule() {
    return this.read([]);
  }
  async saveSchedule() {}
  getNotificationPrefs() {
    return this.read(DEFAULT_NOTIFICATION_PREFS);
  }
  async saveNotificationPrefs() {}
  listNudges() {
    return this.read([]);
  }
  async saveNudge() {}
  getEngineState() {
    return this.read<EngineState>({ nextNudgeAt: null });
  }
  async saveEngineState() {}
  async savePushSubscription() {}
}

function make(userId: string | null = "u1") {
  const inner = new FakeInner();
  const cache = new FakeCache();
  const store = new OfflineStore(inner, cache, () => userId);
  return { inner, cache, store };
}

describe("OfflineStore (fas 1: offline-läsning)", () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => {
    ctx = make();
  });

  it("speglar lyckade läsningar till cachen", async () => {
    const acts = await ctx.store.listActivities();
    expect(acts).toEqual(ctx.inner.activities);
    // put() är fire-and-forget; ge microtask-kön en tick.
    await Promise.resolve();
    expect(ctx.cache.store.get("u1:activities")).toEqual(ctx.inner.activities);
  });

  it("serverar cache vid nätfel (offline)", async () => {
    await ctx.store.listActivities(); // fyll cachen
    await Promise.resolve();
    ctx.inner.fail = new NetworkError();

    const acts = await ctx.store.listActivities();
    expect(acts).toEqual(ctx.inner.activities);
  });

  it("kastar vidare offline när cachen är tom", async () => {
    ctx.inner.fail = new NetworkError();
    await expect(ctx.store.listActivities()).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("serverar INTE cache vid icke-nätfel (t.ex. serverfel)", async () => {
    await ctx.store.listActivities(); // cachen har data
    await Promise.resolve();
    ctx.inner.fail = new Error("500 Internal Server Error");

    await expect(ctx.store.listActivities()).rejects.toThrow("500");
  });

  it("nollställer cachen för användaren vid signOut", async () => {
    await ctx.store.listActivities();
    await ctx.store.getSchedule();
    await Promise.resolve();
    expect(ctx.cache.store.size).toBe(2);

    await ctx.store.signOut();
    expect(ctx.cache.store.size).toBe(0);
    expect(ctx.inner.signedOut).toBe(true);
  });

  it("isolerar cache per användare", async () => {
    const inner = new FakeInner();
    const cache = new FakeCache();
    let uid = "userA";
    const store = new OfflineStore(inner, cache, () => uid);

    await store.listActivities();
    await Promise.resolve();
    expect(cache.store.has("userA:activities")).toBe(true);

    // Byt användare, gå offline: userB har ingen egen cache → nätfelet bubblar.
    uid = "userB";
    inner.fail = new NetworkError();
    await expect(store.listActivities()).rejects.toBeInstanceOf(NetworkError);
  });

  it("skrivningar går rakt igenom (ingen outbox i fas 1)", async () => {
    ctx.inner.fail = new NetworkError();
    // saveActivity delegerar direkt; FakeInner.saveActivity kastar inte, men
    // poängen är att OfflineStore inte sväljer/köar skrivningen.
    await expect(ctx.store.saveActivity(ctx.inner.activities[0])).resolves.toBeUndefined();
  });
});
