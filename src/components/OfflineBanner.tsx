import { useEffect, useState } from "react";
import { isServerMode } from "@/lib/db";

// Diskret banner när enheten är offline. Appen fungerar ändå — den visar din
// senast kända data ur cachen och köar dina ändringar (se OfflineStore), som
// synkas när nätet är tillbaka. I lokalt läge finns ingen server att tappa
// kontakt med, så bannern visas bara i serverläge.

export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!isServerMode() || !offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-30 mx-auto max-w-md
        bg-moss-700/95 px-4 py-1.5 text-center text-[13px] font-medium
        text-parchment-50 backdrop-blur"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.375rem)" }}
    >
      Offline – ändringar sparas och synkas när du är tillbaka
    </div>
  );
}
