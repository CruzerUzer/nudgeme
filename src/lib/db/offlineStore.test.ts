import { describe, it, expect, beforeEach } from "vitest";
import { OfflineStore } from "./offlineStore";
import { NudgeService } from "@/lib/nudge/service";
import type {
  CacheBackend,
  OutboxBackend,
  OutboxKind,
  OutboxOp,
} from "./offlineCache";
import type { DataStore, EngineState } from "./store";
import { NetworkError, AuthError } from "@/lib/api";
import {
  DEFAULT_FREQUENCY,
  DEFAULT_NOTIFICATION_PREFS,
  type Activity,
  type NudgeRecord,
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

// In-memory-outbox med samma FIFO-semantik (auto-inkrementerad seq).
class FakeOutbox implements OutboxBackend {
  ops: OutboxOp[] = [];
  private seq = 0;
  async enqueue(userId: string, kind: OutboxKind, payload: unknown) {
    this.ops.push({
      seq: ++this.seq,
      userId,
      kind,
      payload,
      createdAt: new Date().toISOString(),
    });
  }
  async list(userId: string) {
    return this.ops
      .filter((o) => o.userId === userId)
      .sort((a, b) => a.seq - b.seq);
  }
  async remove(seq: number) {
    this.ops = this.ops.filter((o) => o.seq !== seq);
  }
  async clearUser(userId: string) {
    this.ops = this.ops.filter((o) => o.userId !== userId);
  }
}

// Konfigurerbar fejk-server. `fail` styr om anropen kastar (offline/serverfel).
class FakeInner implements DataStore {
  fail: Error | null = null;
  signedOut = false;
  writes: { kind: string; payload: unknown }[] = [];
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
  private write(kind: string, payload: unknown): Promise<void> {
    if (this.fail) return Promise.reject(this.fail);
    this.writes.push({ kind, payload });
    return Promise.resolve();
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
  saveActivity(a: Activity) {
    return this.write("saveActivity", a);
  }
  deleteActivity(id: string) {
    return this.write("deleteActivity", id);
  }
  getFrequencySettings() {
    return this.read(DEFAULT_FREQUENCY);
  }
  saveFrequencySettings(s: unknown) {
    return this.write("saveFrequencySettings", s);
  }
  getSchedule() {
    return this.read([]);
  }
  saveSchedule(s: unknown) {
    return this.write("saveSchedule", s);
  }
  getNotificationPrefs() {
    return this.read(DEFAULT_NOTIFICATION_PREFS);
  }
  saveNotificationPrefs(p: unknown) {
    return this.write("saveNotificationPrefs", p);
  }
  listNudges() {
    return this.read<NudgeRecord[]>([]);
  }
  saveNudge(n: NudgeRecord) {
    return this.write("saveNudge", n);
  }
  getEngineState() {
    return this.read<EngineState>({ nextNudgeAt: null });
  }
  saveEngineState(s: unknown) {
    return this.write("saveEngineState", s);
  }
  async savePushSubscription() {}
}

function make(userId: string | null = "u1") {
  const inner = new FakeInner();
  const cache = new FakeCache();
  const outbox = new FakeOutbox();
  const store = new OfflineStore(inner, cache, outbox, () => userId);
  return { inner, cache, outbox, store };
}

function nudge(id: string, status: NudgeRecord["status"]): NudgeRecord {
  return { id, userId: "u1", activityId: "a1", sentAt: "2026-01-02T00:00:00.000Z", status };
}

describe("OfflineStore fas 1 – läsning", () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => {
    ctx = make();
  });

  it("speglar lyckade läsningar till cachen", async () => {
    const acts = await ctx.store.listActivities();
    expect(acts).toEqual(ctx.inner.activities);
    await Promise.resolve();
    expect(ctx.cache.store.get("u1:activities")).toEqual(ctx.inner.activities);
  });

  it("serverar cache vid nätfel (offline)", async () => {
    await ctx.store.listActivities();
    await Promise.resolve();
    ctx.inner.fail = new NetworkError();
    expect(await ctx.store.listActivities()).toEqual(ctx.inner.activities);
  });

  it("kastar vidare offline när cachen är tom", async () => {
    ctx.inner.fail = new NetworkError();
    await expect(ctx.store.listActivities()).rejects.toBeInstanceOf(NetworkError);
  });

  it("serverar INTE cache vid icke-nätfel (t.ex. serverfel)", async () => {
    await ctx.store.listActivities();
    await Promise.resolve();
    ctx.inner.fail = new Error("500 Internal Server Error");
    await expect(ctx.store.listActivities()).rejects.toThrow("500");
  });
});

describe("OfflineStore fas 2 – skrivning (outbox)", () => {
  let ctx: ReturnType<typeof make>;
  beforeEach(() => {
    ctx = make();
  });

  it("online: skrivning når servern direkt och kön töms", async () => {
    const a: Activity = { ...ctx.inner.activities[0], title: "Ny titel" };
    await ctx.store.saveActivity(a);
    expect(ctx.inner.writes).toEqual([{ kind: "saveActivity", payload: a }]);
    expect(ctx.outbox.ops).toHaveLength(0);
  });

  it("offline: skrivning köas + uppdaterar cachen optimistiskt", async () => {
    ctx.inner.fail = new NetworkError();
    const a: Activity = { ...ctx.inner.activities[0], title: "Offline-titel" };
    await ctx.store.saveActivity(a); // resolvar trots offline
    expect(ctx.inner.writes).toHaveLength(0);
    expect(ctx.outbox.ops).toHaveLength(1);
    // Optimistisk läsning offline visar ändringen ur cachen.
    const cached = ctx.cache.store.get("u1:activities") as Activity[];
    expect(cached.find((x) => x.id === a.id)?.title).toBe("Offline-titel");
  });

  it("återanslutning: kön spelas upp i FIFO-ordning", async () => {
    ctx.inner.fail = new NetworkError();
    await ctx.store.saveSchedule([]);
    await ctx.store.saveNotificationPrefs(DEFAULT_NOTIFICATION_PREFS);
    await ctx.store.saveActivity(ctx.inner.activities[0]);
    expect(ctx.outbox.ops).toHaveLength(3);

    ctx.inner.fail = null; // nätet tillbaka
    await ctx.store.sync();

    expect(ctx.outbox.ops).toHaveLength(0);
    expect(ctx.inner.writes.map((w) => w.kind)).toEqual([
      "saveSchedule",
      "saveNotificationPrefs",
      "saveActivity",
    ]);
  });

  it("replay är idempotent (upsert med stabilt id, kan köras om)", async () => {
    ctx.inner.fail = new NetworkError();
    await ctx.store.saveActivity(ctx.inner.activities[0]);
    ctx.inner.fail = null;
    await ctx.store.sync();
    await ctx.store.sync(); // andra varvet: inget kvar att skicka
    expect(ctx.inner.writes).toHaveLength(1);
  });

  it("droppar op som servern avvisar (icke-nätfel) utan att blockera resten", async () => {
    // Köa två offline.
    ctx.inner.fail = new NetworkError();
    await ctx.store.saveActivity(ctx.inner.activities[0]);
    await ctx.store.saveSchedule([]);

    // Online, men servern avvisar ALLT med 400 första varvet.
    ctx.inner.fail = new Error("400 Bad Request");
    await ctx.store.sync();
    // Båda ska ha droppats (inte fastnat) så kön är tom.
    expect(ctx.outbox.ops).toHaveLength(0);
    expect(ctx.inner.writes).toHaveLength(0);
  });

  it("behåller kön vid utgången session (AuthError) för replay efter inlogg", async () => {
    ctx.inner.fail = new NetworkError();
    await ctx.store.saveActivity(ctx.inner.activities[0]);

    ctx.inner.fail = new AuthError();
    await ctx.store.sync(); // ska inte kasta, ska inte droppa
    expect(ctx.outbox.ops).toHaveLength(1);

    ctx.inner.fail = null;
    await ctx.store.sync();
    expect(ctx.outbox.ops).toHaveLength(0);
    expect(ctx.inner.writes).toHaveLength(1);
  });

  it("nudge-guard: optimistisk cache backar aldrig en 'done'", async () => {
    // Seed: en genomförd nudge i cachen.
    ctx.cache.store.set("u1:nudges", [nudge("n1", "done")]);
    ctx.inner.fail = new NetworkError();

    // Offline-försök att snooza den (skulle backa status) ska ignoreras i cachen.
    await ctx.store.saveNudge(nudge("n1", "snoozed"));
    const cached = ctx.cache.store.get("u1:nudges") as NudgeRecord[];
    expect(cached[0].status).toBe("done");
  });

  it("signOut nollställer cache + outbox och loggar ut", async () => {
    ctx.inner.fail = new NetworkError();
    await ctx.store.saveActivity(ctx.inner.activities[0]); // en köad op + cache
    expect(ctx.outbox.ops.length + ctx.cache.store.size).toBeGreaterThan(0);

    await ctx.store.signOut();
    expect(ctx.cache.store.size).toBe(0);
    expect(ctx.outbox.ops).toHaveLength(0);
    expect(ctx.inner.signedOut).toBe(true);
  });
});

describe("OfflineStore fas 3 – robusthet & Överraska mig offline", () => {
  it('"Överraska mig" fungerar offline: cachad pool + köad completeOnDemand', async () => {
    const { store, cache, outbox, inner } = make();
    // Seed: en aktiv aktivitet + defaults i cachen (som efter en online-session).
    cache.store.set("u1:activities", inner.activities);
    cache.store.set("u1:frequency", DEFAULT_FREQUENCY);
    cache.store.set("u1:nudges", []);
    inner.fail = new NetworkError(); // offline

    const service = new NudgeService(store);
    const picked = await service.surprise(new Date());
    expect(picked?.id).toBe("a1"); // vald lokalt ur cachad pool

    await service.completeOnDemand("a1");
    // Loggad som köad skrivning + optimistiskt i cachen (status done).
    expect(outbox.ops.some((o) => o.kind === "saveNudge")).toBe(true);
    const nudges = cache.store.get("u1:nudges") as NudgeRecord[];
    expect(
      nudges.some((n) => n.activityId === "a1" && n.status === "done"),
    ).toBe(true);
  });

  it("opportunistisk drain: en lyckad läsning tömmer kön utan online-event", async () => {
    const { store, inner, outbox } = make();
    inner.fail = new NetworkError();
    await store.saveActivity(inner.activities[0]); // köad offline
    expect(outbox.ops).toHaveLength(1);

    inner.fail = null; // nätet tillbaka men inget "online"-event fyras
    await store.listActivities(); // en lyckad läsning triggar opportunistisk drain
    await new Promise((r) => setTimeout(r, 10)); // fire-and-forget → låt den landa

    expect(outbox.ops).toHaveLength(0);
    expect(inner.writes.map((w) => w.kind)).toContain("saveActivity");
  });
});
