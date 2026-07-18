import type { DataStore } from "@/lib/db/store";
import type { Activity, NudgeRecord } from "@/lib/types";
import { selectNudge } from "./selection";
import { nextNudgeTimestamp } from "./schedule";

// Klientsidans nudge-motor. Speglar det som Edge Function + pg_cron gör på
// servern i produktionsläge — men gör NudgeMe fullt körbar lokalt utan backend.
// Kärnregler: högst en aktiv (oackad) nudge i taget; obesvarade nudges tjatar
// aldrig men auto-ignoreras när nästa är due; uppföljningsfråga endast efter
// ett aktivt "ska göra".

const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;

/** En nudge som väntar på användarens svar. */
const PENDING: ReadonlySet<NudgeRecord["status"]> = new Set([
  "sent",
  "acked",
  "committed",
]);

export interface NudgeView {
  record: NudgeRecord;
  activity: Activity;
  /** Uppföljningsfrågan ("hur gick det?") ska visas. */
  needsFollowUp: boolean;
}

export class NudgeService {
  constructor(private store: DataStore) {}

  private async userId() {
    return this.store.getUserId();
  }

  /** Aktuell väntande nudge (om någon), berikad med aktivitet + follow-up-flagga. */
  async currentNudge(now = new Date()): Promise<NudgeView | null> {
    const nudges = await this.store.listNudges();
    const pending = nudges
      .filter((n) => PENDING.has(n.status))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
    if (!pending) return null;
    const activity = (await this.store.listActivities()).find(
      (a) => a.id === pending.activityId,
    );
    if (!activity) return null;

    const prefs = await this.store.getNotificationPrefs();
    const needsFollowUp =
      pending.status === "committed" &&
      !pending.followUpAskedAt &&
      now.getTime() - new Date(pending.sentAt).getTime() >=
        prefs.followUpAfterHours * 3_600_000;

    return { record: pending, activity, needsFollowUp };
  }

  /**
   * "Cron-simulering": kör vid app-öppning/fokus. Om det är dags för nästa
   * nudge auto-ignoreras en obesvarad tidigare nudge och en ny genereras.
   * Returnerar den aktuella nudgen (ny eller befintlig).
   */
  async refresh(now = new Date()): Promise<NudgeView | null> {
    const prefs = await this.store.getNotificationPrefs();
    if (prefs.paused) return this.currentNudge(now);

    const engine = await this.store.getEngineState();
    const schedule = await this.store.getSchedule();

    // Allra första gången: bjud direkt på en välkomnande nudge och schemalägg
    // sedan nästa. Annars skulle appen mötas av ett tomt tillstånd fram till
    // första schemalagda tidpunkten.
    if (!engine.nextNudgeAt) {
      const created = await this.generate(now);
      await this.scheduleNext(now, schedule);
      return created ?? this.currentNudge(now);
    }

    const due = new Date(engine.nextNudgeAt).getTime() <= now.getTime();
    if (!due) return this.currentNudge(now);

    // Det är dags: auto-ignorera en obesvarad (fortfarande "sent") nudge.
    const current = await this.currentNudge(now);
    if (current && current.record.status === "sent") {
      await this.store.saveNudge({ ...current.record, status: "ignored" });
    }
    // Om användaren redan ackat/committat låter vi den ligga kvar och
    // skjuter bara fram nästa tid (skapar ingen krockande ny nudge).
    if (current && current.record.status !== "sent") {
      await this.scheduleNext(now, schedule);
      return current;
    }

    const created = await this.generate(now);
    await this.scheduleNext(now, schedule);
    return created;
  }

  private async scheduleNext(
    now: Date,
    schedule: Awaited<ReturnType<DataStore["getSchedule"]>>,
  ) {
    const next = nextNudgeTimestamp(now, schedule);
    await this.store.saveEngineState({
      nextNudgeAt: next ? next.toISOString() : null,
    });
  }

  /** Skapa en ny nudge från den kvalificerade poolen. */
  private async generate(now: Date): Promise<NudgeView | null> {
    const [activities, settings, history] = await Promise.all([
      this.store.listActivities(),
      this.store.getFrequencySettings(),
      this.store.listNudges(),
    ]);
    // Endast en snoozad i taget: när nästa aktivitet föreslås enligt schema
    // blir en tidigare snoozad aktivitet automatiskt ignorerad.
    for (const n of history) {
      if (n.status === "snoozed") {
        await this.store.saveNudge({ ...n, status: "ignored" });
      }
    }
    const activity = selectNudge(activities, settings, history, now);
    if (!activity) return null;
    const record: NudgeRecord = {
      id: uid(),
      userId: await this.userId(),
      activityId: activity.id,
      sentAt: now.toISOString(),
      status: "sent",
    };
    await this.store.saveNudge(record);
    return { record, activity, needsFollowUp: false };
  }

  // --- Livscykel-övergångar (kvittering) ---

  async ack(id: string, now = new Date()) {
    await this.transition(id, (n) => ({
      ...n,
      status: n.status === "committed" ? "committed" : "acked",
      ackedAt: n.ackedAt ?? now.toISOString(),
    }));
  }

  async commit(id: string, now = new Date()) {
    await this.transition(id, (n) => ({
      ...n,
      status: "committed",
      ackedAt: n.ackedAt ?? now.toISOString(),
    }));
  }

  async markDone(id: string, now = new Date()) {
    await this.transition(id, (n) => ({
      ...n,
      status: "done",
      ackedAt: n.ackedAt ?? now.toISOString(),
      doneAt: now.toISOString(),
    }));
  }

  /** "Inte just nu" — mjuk snooze. Nästa refresh kan generera på nytt. */
  async snooze(id: string) {
    await this.transition(id, (n) => ({ ...n, status: "snoozed" }));
  }

  /** Markera att uppföljningsfrågan visats så den inte återkommer. */
  async markFollowUpAsked(id: string, now = new Date()) {
    await this.transition(id, (n) => ({
      ...n,
      followUpAskedAt: now.toISOString(),
    }));
  }

  private async transition(
    id: string,
    fn: (n: NudgeRecord) => NudgeRecord,
  ) {
    const nudges = await this.store.listNudges();
    const rec = nudges.find((n) => n.id === id);
    if (!rec) return;
    await this.store.saveNudge(fn(rec));
  }

  // --- På begäran ---

  /** "Överraska mig": en slumpaktivitet på begäran ur den kvalificerade poolen. */
  async surprise(
    now = new Date(),
    rnd = Math.random,
    exclude?: string,
  ): Promise<Activity | null> {
    const [activities, settings, history] = await Promise.all([
      this.store.listActivities(),
      this.store.getFrequencySettings(),
      this.store.listNudges(),
    ]);
    return selectNudge(activities, settings, history, now, rnd, exclude);
  }

  /** Logga en på-begäran-aktivitet som genomförd, för historikens skull. */
  async completeOnDemand(activityId: string, now = new Date()) {
    const record: NudgeRecord = {
      id: uid(),
      userId: await this.userId(),
      activityId,
      sentAt: now.toISOString(),
      status: "done",
      ackedAt: now.toISOString(),
      doneAt: now.toISOString(),
    };
    await this.store.saveNudge(record);
  }

  /** Revidera en snoozad nudge till genomförd (om man ändrat sig i historiken). */
  async completeSnoozed(id: string, now = new Date()) {
    await this.markDone(id, now);
  }

  async history(): Promise<NudgeRecord[]> {
    const nudges = await this.store.listNudges();
    return nudges.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }
}
