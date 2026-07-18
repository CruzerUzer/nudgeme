import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { getStore, isLocalMode, isServerMode } from "@/lib/db";
import { NudgeService, type NudgeView } from "@/lib/nudge/service";
import type {
  Activity,
  DaySchedule,
  FrequencySettings,
  NotificationPrefs,
  NudgeRecord,
} from "@/lib/types";

interface AppState {
  loading: boolean;
  localMode: boolean;
  serverMode: boolean;
  signOut: () => Promise<void>;
  service: NudgeService;
  current: NudgeView | null;
  activities: Activity[];
  frequency: FrequencySettings;
  schedule: DaySchedule[];
  prefs: NotificationPrefs;
  history: NudgeRecord[];
  reload: () => Promise<void>;
  saveActivity: (a: Activity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
  saveFrequency: (s: FrequencySettings) => Promise<void>;
  saveSchedule: (s: DaySchedule[]) => Promise<void>;
  savePrefs: (p: NotificationPrefs) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => getStore(), []);
  const service = useMemo(() => new NudgeService(store), [store]);

  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<NudgeView | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [frequency, setFrequency] = useState<FrequencySettings | null>(null);
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [history, setHistory] = useState<NudgeRecord[]>([]);

  const reload = useCallback(async () => {
    // I serverläge äger servern genereringen — klienten läser bara aktuell
    // nudge. I lokalt läge kör refresh() "cron-simuleringen" som genererar.
    const cur = isServerMode()
      ? await service.currentNudge()
      : await service.refresh();
    const [acts, freq, sched, np, hist] = await Promise.all([
      store.listActivities(),
      store.getFrequencySettings(),
      store.getSchedule(),
      store.getNotificationPrefs(),
      service.history(),
    ]);
    setCurrent(cur);
    setActivities(acts);
    setFrequency(freq);
    setSchedule(sched);
    setPrefs(np);
    setHistory(hist);
  }, [service, store]);

  useEffect(() => {
    void (async () => {
      await reload();
      setLoading(false);
    })();
    // Kör om när fliken får fokus igen (som en riktig påminnelseapp).
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [reload]);

  const value: AppState = {
    loading,
    localMode: isLocalMode(),
    serverMode: isServerMode(),
    signOut: async () => {
      await store.signOut();
      window.location.reload();
    },
    service,
    current,
    activities,
    frequency: frequency!,
    schedule,
    prefs: prefs!,
    history,
    reload,
    saveActivity: async (a) => {
      await store.saveActivity(a);
      await reload();
    },
    deleteActivity: async (id) => {
      await store.deleteActivity(id);
      await reload();
    },
    saveFrequency: async (s) => {
      await store.saveFrequencySettings(s);
      await reload();
    },
    saveSchedule: async (s) => {
      await store.saveSchedule(s);
      await reload();
    },
    savePrefs: async (p) => {
      await store.saveNotificationPrefs(p);
      await reload();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp måste användas inom AppProvider");
  return ctx;
}
