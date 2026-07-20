import { apiFetch, apiBase, getToken } from "@/lib/api";

// Klient-API för bakgrundspaket. Bild-URL:er från servern är relativa
// ("/api/backgrounds/image/..."); bgUrl() prefixar apiBase så de funkar även när
// servern ligger på en absolut VITE_API_URL.

export interface BgImage {
  screen: string;
  url: string;
}
export interface BgPack {
  id: string;
  name: string;
  builtin: boolean;
  images: BgImage[];
}

export const BG_SCREENS = [
  { key: "login", label: "Inloggning" },
  { key: "home", label: "Hem" },
  { key: "activities", label: "Aktiviteter" },
  { key: "schedule", label: "Schema" },
  { key: "history", label: "Historik" },
  { key: "settings", label: "Inställningar" },
] as const;

export function bgUrl(url: string): string {
  return `${apiBase()}${url}`;
}

/** App-övergripande inloggningsbakgrund (publik, pre-auth). Null om ingen. */
export async function getLoginBackground(): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/api/backgrounds/login-background`);
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url: string | null };
    return url ? bgUrl(url) : null;
  } catch {
    return null;
  }
}

export function listPacks() {
  return apiFetch<BgPack[]>("/api/backgrounds/packs");
}

export function getSelectedPack() {
  return apiFetch<{ packId: string | null }>("/api/background-pack");
}

export async function selectPack(packId: string | null) {
  await apiFetch("/api/background-pack", {
    method: "PUT",
    body: JSON.stringify({ packId }),
  });
}

// --- Admin ---
export function createPack(name: string) {
  return apiFetch<{ id: string; name: string }>("/api/admin/backgrounds/packs", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deletePack(id: string) {
  return apiFetch(`/api/admin/backgrounds/packs/${id}`, { method: "DELETE" });
}

export async function uploadImage(packId: string, screen: string, file: File) {
  const form = new FormData();
  form.append("screen", screen);
  form.append("image", file);
  const res = await fetch(`${apiBase()}/api/admin/backgrounds/packs/${packId}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` }, // låt browsern sätta multipart-boundary
    body: form,
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error ?? "Uppladdningen misslyckades.";
    throw new Error(msg);
  }
  return res.json();
}
