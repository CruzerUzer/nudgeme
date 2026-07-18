import type {
  Activity,
  DaySchedule,
  FrequencySettings,
  NotificationPrefs,
  NudgeRecord,
  PushSubscriptionRecord,
} from "@/lib/types";

/** Motorns bokföring: när nästa nudge ska genereras. */
export interface EngineState {
  nextNudgeAt: string | null;
}

// Persistensgränssnitt. Två implementationer: LocalStore (localStorage, för
// utveckling/offline) och SupabaseStore (riktiga konton, multi-user). All
// affärslogik ligger i NudgeService ovanpå detta gränssnitt.
export interface DataStore {
  /** Aktuell användares id. Lokalt: en genererad gäst. Supabase: auth-uid. */
  getUserId(): Promise<string>;
  isAuthenticated(): Promise<boolean>;
  signOut(): Promise<void>;

  listActivities(): Promise<Activity[]>;
  saveActivity(a: Activity): Promise<void>;
  deleteActivity(id: string): Promise<void>;

  getFrequencySettings(): Promise<FrequencySettings>;
  saveFrequencySettings(s: FrequencySettings): Promise<void>;

  getSchedule(): Promise<DaySchedule[]>;
  saveSchedule(s: DaySchedule[]): Promise<void>;

  getNotificationPrefs(): Promise<NotificationPrefs>;
  saveNotificationPrefs(p: NotificationPrefs): Promise<void>;

  listNudges(): Promise<NudgeRecord[]>;
  saveNudge(n: NudgeRecord): Promise<void>;

  getEngineState(): Promise<EngineState>;
  saveEngineState(s: EngineState): Promise<void>;

  savePushSubscription(sub: PushSubscriptionRecord): Promise<void>;
}
