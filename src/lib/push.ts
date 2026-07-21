import { getStore, isServerMode } from "@/lib/db";
import { apiFetch } from "@/lib/api";
import type { PushSubscriptionRecord } from "@/lib/types";

// Web Push-hjälpare. Push i webbläsare kräver: (1) service worker,
// (2) användarens tillstånd, (3) en prenumeration med VAPID-nyckel som
// skickas till servern. På iOS måste appen vara tillagd på hemskärmen först
// (16.4+). Utan VAPID-nyckel kan vi bara visa lokala notiser.

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
        "Notiser tillåtna. Riktiga push kräver en VAPID-nyckel på servern (se README).",
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
  // Direkt bekräftelse så man ser att notiser funkar på enheten.
  await reg.showNotification("NudgeMe", {
    body: "Notiser är på! 🌿 Du får en knuff när det är dags.",
    icon: "/icons/icon-192.png",
  });
  return { ok: true, message: "Klart! Du får en aktivitet när tiden är rätt." };
}

/**
 * Kör vid inloggning: om enheten redan har notistillstånd + prenumeration,
 * koppla den till den NUvarande användaren så notiser följer inloggningen.
 * Skapar ingen prompt (bara om tillstånd redan givits).
 */
export async function syncPush(): Promise<void> {
  if (!isServerMode() || !pushSupported()) return;
  if (Notification.permission !== "granted") return;
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapid) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
    }
    const json = sub.toJSON();
    const store = getStore();
    await store.savePushSubscription({
      id: json.endpoint ?? crypto.randomUUID(),
      userId: await store.getUserId(),
      endpoint: json.endpoint!,
      keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    });
  } catch {
    /* best effort – notiser ska aldrig blockera appen */
  }
}

/**
 * Kör vid utloggning: ta bort den här enhetens prenumeration på servern så den
 * utloggade användaren slutar få notiser. (Webbläsarens prenumeration behålls
 * så nästa inloggade användare kan återkopplas via syncPush.)
 */
export async function removePushOnLogout(): Promise<void> {
  if (!isServerMode() || !pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub?.toJSON().endpoint;
    if (!endpoint) return;
    await apiFetch("/api/push-subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* best effort */
  }
}
