import { apiBase, setSession, clearSession, setMustChange, type Session } from "@/lib/api";
import { apiFetch } from "@/lib/api";

// Inloggning/registrering och lösenords-/adminfunktioner mot den lokala servern.

async function post(path: string, body: unknown): Promise<Session> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Något gick fel.");
  return data as Session;
}

export async function registerUser(username: string, password: string) {
  const r = await post("/api/auth/register", { username, password });
  setSession(r);
  return r;
}

export async function loginUser(username: string, password: string) {
  const r = await post("/api/auth/login", { username, password });
  setSession(r);
  return r;
}

export function logout() {
  clearSession();
}

/** Byt eget lösenord. Rensar även tvingat-byte-flaggan lokalt. */
export async function changePassword(oldPassword: string, newPassword: string) {
  await apiFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  setMustChange(false);
}

// --- Admin ---

export interface AdminUser {
  id: string;
  username: string;
  role: string;
  mustChangePassword: boolean;
}

export function adminListUsers() {
  return apiFetch<AdminUser[]>("/api/admin/users");
}

export function adminCreateUser(username: string) {
  return apiFetch<{ id: string; username: string; defaultPassword: string }>(
    "/api/admin/users",
    { method: "POST", body: JSON.stringify({ username }) },
  );
}

export function adminResetPassword(id: string) {
  return apiFetch<{ defaultPassword: string }>(
    `/api/admin/users/${id}/reset-password`,
    { method: "POST" },
  );
}

export function adminSetRole(id: string, role: "user" | "admin") {
  return apiFetch(`/api/admin/users/${id}/role`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export function adminRenameUser(id: string, username: string) {
  return apiFetch<{ id: string; username: string }>(`/api/admin/users/${id}/rename`, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function adminDeleteUser(id: string) {
  return apiFetch(`/api/admin/users/${id}`, { method: "DELETE" });
}

export function adminSetRegistration(open: boolean) {
  return apiFetch<{ open: boolean }>("/api/admin/registration", {
    method: "PUT",
    body: JSON.stringify({ open }),
  });
}

/** Publik (pre-auth): får nya registrera sig? */
export async function getRegistrationOpen(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/registration-status`);
    if (!res.ok) return true;
    return !!(await res.json()).open;
  } catch {
    return true;
  }
}
