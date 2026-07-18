import { useEffect, useState } from "react";
import { canInstall, promptInstall, isIos, isStandalone } from "@/lib/pwaInstall";

// "Ladda ner som app"-kort. Visar installationsknapp där webbläsaren stöder det
// (Android/Chrome), annars en instruktion (iOS/övrigt).
export default function InstallCard() {
  const [installable, setInstallable] = useState(canInstall());
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onInstallable = () => setInstallable(canInstall());
    const onInstalled = () => setInstalled(true);
    window.addEventListener("pwa-installable", onInstallable);
    window.addEventListener("pwa-installed", onInstalled);
    return () => {
      window.removeEventListener("pwa-installable", onInstallable);
      window.removeEventListener("pwa-installed", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <section className="card p-5">
        <h2 className="text-lg text-moss-800">Appen är installerad ✨</h2>
        <p className="text-sm text-moss-500">Du kör NudgeMe som en app. Fint!</p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="text-lg text-moss-800">Ladda ner som app</h2>
      {installable ? (
        <>
          <p className="mb-3 text-sm text-moss-500">
            Lägg NudgeMe på hemskärmen för snabb åtkomst och notiser.
          </p>
          <button className="btn-primary w-full" onClick={() => void promptInstall()}>
            Installera appen
          </button>
        </>
      ) : isIos() ? (
        <p className="text-sm text-moss-500">
          På iPhone: tryck på <strong>Dela</strong>-ikonen och välj{" "}
          <em>”Lägg till på hemskärmen”</em>. Öppna sedan NudgeMe därifrån.
        </p>
      ) : (
        <p className="text-sm text-moss-500">
          Öppna webbläsarens meny och välj <em>”Installera app”</em> eller{" "}
          <em>”Lägg till på hemskärmen”</em>.
        </p>
      )}
    </section>
  );
}
