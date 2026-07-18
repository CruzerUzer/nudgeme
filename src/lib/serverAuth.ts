import { apiBase, setSession, clearSession } from "@/lib/api";

// Inloggning/registrering mot den lokala servern (användarnamn + lösenord).

interface AuthResult {
  id: string;
  username: string;
  token: string;
}

async function post(path: string, body: unknown): Promise<AuthResult> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Något gick fel.");
  return data as AuthResult;
}

export async function registerUser(username: string, password: string) {
  const r = await post("/api/auth/register", { username, password });
  setSession(r.id, r.token);
  return r;
}

export async function loginUser(username: string, password: string) {
  const r = await post("/api/auth/login", { username, password });
  setSession(r.id, r.token);
  return r;
}

export function logout() {
  clearSession();
}
