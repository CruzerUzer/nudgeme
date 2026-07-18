import { getStore } from "@/lib/db";
import type { PushSubscriptionRecord } from "@/lib/types";

// Web Push-hjälpare. Push i webbläsare kräver: (1) service worker,
// (2) användarens tillstånd, (3) en prenumeration med VAPID-nyckel som
// skickas till servern. På iOS måste appen vara tillagd på hemskärmen först
// (16.4+). Utan VAPID-nyckel/Supabase kan vi bara visa lokala notiser.

export function pushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iOS-PWA måste installeras på hemskärmen för att få ta emot push. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error – iOS-specifik flagga
    window.navigator.standalone === true
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    return { ok: false, message: "Den här webbläsaren stöder inte notiser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Inga notiser utan ditt godkännande – helt okej." };
  }

  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const reg = await navigator.serviceWorker.ready;

  if (!vapid) {
    // Ingen server att prenumerera mot – men vi kan visa en lokal testnotis.
    await reg.showNotification("NudgeMe", {
      body: "Notiser är aktiverade på den här enheten. ✨",
      silent: true,
    });
    return {
      ok: true,
      message:
        "Notiser tillåtna. Riktiga push kräver ett Supabase-projekt med VAPID-nyckel (se README).",
    };
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
  });

  const json = sub.toJSON();
  const store = getStore();
  const record: PushSubscriptionRecord = {
    id: json.endpoint ?? crypto.randomUUID(),
    userId: await store.getUserId(),
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
  await store.savePushSubscription(record);
  return { ok: true, message: "Klart! Du får en vänlig knuff när tiden är rätt." };
}
