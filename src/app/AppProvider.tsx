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
import { nextNudgeTimestamp } from "@/lib/nudge/schedule";
import { listPacks, getSelectedPack, bgUrl } from "@/lib/backgrounds";
import { syncPush, removePushOnLogout } from "@/lib/push";
import { apiFetch } from "@/lib/api";
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
  /** Vald bakgrundsbild per skärm (screen-nyckel -> url). Tom om ingen valts. */
  backgroundImages: Record<string, string>;
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
  const [backgroundImages, setBackgroundImages] = useState<Record<string, string>>({});

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

    // Bakgrundsbilder (server-läge, icke-kritiskt).
    let bgImages: Record<string, string> = {};
    if (isServerMode()) {
      try {
        const [packs, sel] = await Promise.all([listPacks(), getSelectedPack()]);
        const pack = packs.find((p) => p.id === sel.packId);
        if (pack) {
          for (const img of pack.images) bgImages[img.screen] = bgUrl(img.url);
        }
      } catch {
        /* bakgrunder ska aldrig blockera appen */
      }
    }
    setBackgroundImages(bgImages);
  }, [service, store]);

    // Skicka enhetens tidszon så schema/notiser räknas i användarens lokala tid.
    // Följer enheten – körs vid start OCH när appen får fokus (t.ex. efter resa).
    const syncTimeZone = () => {
      if (!isServerMode()) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        void apiFetch("/api/timezone", {
          method: "PUT",
          body: JSON.stringify({ tz }),
        }).catch(() => undefined);
      }
    };

    void (async () => {
      await reload();
      setLoading(false);
      // Koppla enhetens push-prenumeration till den inloggade användaren.
      void syncPush();
      syncTimeZone();
    })();
    // Kör om + synka tidszon när fliken får fokus igen (som en riktig påminnelseapp).
    const onFocus = () => {
      void reload();
      syncTimeZone();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    // Poll så att nya aktiviteter dyker upp av sig själva (servern genererar
    // dem, och lokalt läge genererar när det är dags) utan manuell omladdning.
    const poll = window.setInterval(() => void reload(), 15_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(poll);
    };
  }, [reload]);

  const value: AppState = {
    loading,
    localMode: isLocalMode(),
    serverMode: isServerMode(),
    signOut: async () => {
      await removePushOnLogout(); // stoppa notiser för den utloggade användaren
      await store.signOut();
      window.location.reload();
    },
    backgroundImages,
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
      // Lokalt läge: räkna om nästa aktivitets-tidpunkt så ändringen får effekt
      // direkt (i serverläge gör servern det på PUT /schedule).
      if (!isServerMode()) {
        const next = nextNudgeTimestamp(new Date(), s);
        await store.saveEngineState({
          nextNudgeAt: next ? next.toISOString() : null,
        });
      }
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
