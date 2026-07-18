// Klientens koppling mot den lokala NudgeMe-servern. JWT lagras i localStorage.

const TOKEN_KEY = "nudgeme:token";
const USER_KEY = "nudgeme:userId";

export function apiBase(): string {
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function setSession(userId: string, token: string) {
  localStorage.setItem(USER_KEY, userId);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Fetch mot API:t med Bearer-token. Kastar med serverns felmeddelande. */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearSession();
    throw new Error("Sessionen har gått ut. Logga in igen.");
  }
  if (!res.ok) {
    let msg = "Något gick fel.";
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignorera */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
