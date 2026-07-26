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

/**
 * Nätfel (offline, DNS, avbrott) — till skillnad från ett HTTP-svar med
 * felstatus. Låter offline-lagret skilja "ingen nät" (servera cache) från ett
 * äkta serverfel (som ska propageras).
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Ingen nätverksanslutning.");
    this.name = "NetworkError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Sessionen har gått ut (HTTP 401). Skild från NetworkError så outbox-replayn
 * kan stoppa och behålla kön tills användaren loggat in igen – i stället för
 * att tappa köade skrivningar.
 */
export class AuthError extends Error {
  constructor() {
    super("Sessionen har gått ut. Logga in igen.");
    this.name = "AuthError";
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

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  } catch (e) {
    // fetch() rejectar (TypeError) när nätet inte går att nå — inte samma sak
    // som ett HTTP-felsvar. Markera som NetworkError så anropare kan falla
    // tillbaka på cache.
    throw new NetworkError(e);
  }
  if (res.status === 401) {
    clearSession();
    throw new AuthError();
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
