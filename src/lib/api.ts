// Klientens koppling mot den lokala NudgeMe-servern. JWT lagras i localStorage.

const TOKEN_KEY = "nudgeme:token";
const USER_KEY = "nudgeme:userId";
const ROLE_KEY = "nudgeme:role";
const MUSTCHANGE_KEY = "nudgeme:mustChange";

export interface Session {
  id: string;
  username: string;
  token: string;
  role: string;
  mustChangePassword: boolean;
}

export function apiBase(): string {
  return (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUserId(): string | null {
  return localStorage.getItem(USER_KEY);
}

export function getRole(): string {
  return localStorage.getItem(ROLE_KEY) ?? "user";
}

export function isAdmin(): boolean {
  return getRole() === "admin";
}

export function getMustChange(): boolean {
  return localStorage.getItem(MUSTCHANGE_KEY) === "1";
}

export function setMustChange(value: boolean) {
  localStorage.setItem(MUSTCHANGE_KEY, value ? "1" : "0");
}

export function setSession(s: Session) {
  localStorage.setItem(USER_KEY, s.id);
  localStorage.setItem(TOKEN_KEY, s.token);
  localStorage.setItem(ROLE_KEY, s.role);
  setMustChange(s.mustChangePassword);
}

export function clearSession() {
  for (const k of [TOKEN_KEY, USER_KEY, ROLE_KEY, MUSTCHANGE_KEY]) {
    localStorage.removeItem(k);
  }
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
