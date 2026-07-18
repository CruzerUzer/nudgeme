// Hanterar "installera som app" (PWA). På Android/Chrome fångar vi
// `beforeinstallprompt` (måste ske tidigt, därför importeras modulen i main.tsx)
// och kan senare visa den. På iOS finns ingen prompt – där visar vi instruktion.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("pwa-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.dispatchEvent(new Event("pwa-installed"));
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  window.dispatchEvent(new Event("pwa-installable"));
  return outcome === "accepted";
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error – iOS-specifik flagga
    window.navigator.standalone === true
  );
}
