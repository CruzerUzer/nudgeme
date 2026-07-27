import type { DataStore } from "@/lib/db/store";
import type { Activity, NudgeRecord } from "@/lib/types";
import { selectNudge } from "./selection";
import { nextNudgeTimestamp } from "./schedule";

// Klientsidans nudge-motor. Speglar serverns motor (server/src/engine.ts) — men
// gör NudgeMe fullt körbar lokalt utan backend. Livscykelreglerna delas via
// scenariotabellen i ./lifecycle.cases.ts; ändra aldrig den ena motorn utan den
// andra. Kärnregler: bara en nudge du engagerat dig i blockerar en ny; obesvarade
// nudges tjatar aldrig men auto-ignoreras när nästa är due; uppföljningsfråga
// endast efter ett aktivt "ska göra".

const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;

// Två skilda frågor om status — håll dem isär. Att blanda ihop dem var orsaken
// till buggen där en orörd nudge låg kvar i dagar (se CLAUDE.md → Nudge-livscykeln).
/** Visas som "aktuell nudge" i appen. En orörd `sent` hör hit. */
const VISIBLE: ReadonlySet<NudgeRecord["status"]> = new Set([
  "sent",
  "acked",
  "committed",
]);
/**
 * Användaren har aktivt engagerat sig → blockerar en ny nudge tills hon gör klart
 * eller snoozar. En orörd `sent` hör INTE hit: den ersätts när nästa är due.
 */
const ENGAGED: ReadonlySet<NudgeRecord["status"]> = new Set([
  "acked",
  "committed",
]);
/** Auto-ignoreras när en ny nudge föreslås (tjatar aldrig). */
const AUTO_IGNORED: ReadonlySet<NudgeRecord["status"]> = new Set([
  "sent",
  "snoozed",
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
      .filter((n) => VISIBLE.has(n.status))
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
    const engine = await this.store.getEngineState();
    const schedule = await this.store.getSchedule();
    const due =
      !!engine.nextNudgeAt &&
      new Date(engine.nextNudgeAt).getTime() <= now.getTime();

    if (prefs.paused) {
      // Pausad: generera aldrig. Men ett tillfälle som passerat under pausen
      // skjuts fram, annars smäller en nudge direkt vid avpausning. Samma regel
      // som serverns processUser.
      if (due) await this.scheduleNext(now, schedule);
      return this.currentNudge(now);
    }

    // Allra första gången: bjud direkt på en välkomnande nudge och schemalägg
    // sedan nästa. Annars skulle appen mötas av ett tomt tillstånd fram till
    // första schemalagda tidpunkten.
    if (!engine.nextNudgeAt) {
      const created = await this.generate(now);
      await this.scheduleNext(now, schedule);
      return created ?? this.currentNudge(now);
    }

    if (!due) return this.currentNudge(now);

    // En nudge som användaren engagerat sig i (acked/committed) ligger kvar tills
    // hon gör klart eller snoozar – ingen ny byter ut den. En orörd "sent"
    // räknas inte som aktiv: den auto-ignoreras och ersätts av en ny.
    // Vi tittar på HELA historiken, inte bara den senaste synliga, så att regeln
    // blir identisk med serverns.
    const nudges = await this.store.listNudges();
    if (nudges.some((n) => ENGAGED.has(n.status))) {
      await this.scheduleNext(now, schedule);
      return this.currentNudge(now);
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
    // En orörd nudge tjatar aldrig: en tidigare snoozad OCH en obesvarad "sent"
    // blir automatiskt ignorerad när nästa aktivitet föreslås. Aktivt engagerade
    // (acked/committed) rörs inte här – de har redan behållits i refresh().
    for (const n of history) {
      if (AUTO_IGNORED.has(n.status)) {
        await this.store.saveNudge({ ...n, status: "ignored" });
      }
    }
    // Urvalet måste se historiken EFTER auto-ignoreringen: en nudge du aldrig såg
    // ska inte förbruka frekvenstaket. Med den gamla (lästa) historiken räknades
    // den nyss ignorerade som "sent" och åt upp taket, vilket kunde tömma poolen
    // helt när bara en aktivitet var valbar → varannan nudge uteblev.
    const effective = history.map((n) =>
      AUTO_IGNORED.has(n.status) ? { ...n, status: "ignored" as const } : n,
    );
    // Undvik att direkt upprepa samma aktivitet: exkludera den senaste nudgens
    // aktivitet (den som just ersätts) om det finns något annat att välja.
    const prev = [...effective].sort((a, b) =>
      b.sentAt.localeCompare(a.sentAt),
    )[0];
    const activity = selectNudge(
      activities,
      settings,
      effective,
      now,
      Math.random,
      prev?.activityId,
    );
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

  /**
   * Ångra en snooze: ta fram den snoozade aktiviteten igen som ett aktivt kort
   * på Hem, precis som om man fått den och tryckt "Ja, jag gör det" (status
   * committed). Blir alltså INTE genomförd direkt. sentAt sätts till nu så att
   * kortet blir det aktuella.
   */
  async reviveSnoozed(id: string, now = new Date()) {
    await this.transition(id, (n) => ({
      ...n,
      status: "committed",
      sentAt: now.toISOString(),
      ackedAt: now.toISOString(),
      doneAt: undefined,
      followUpAskedAt: undefined,
    }));
  }

  async history(): Promise<NudgeRecord[]> {
    const nudges = await this.store.listNudges();
    return nudges.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }
}
