import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db.js";
import { SEED_ACTIVITIES } from "./seed.js";
import { defaultImageDataUrl } from "./defaultImages.js";

// Användarnamn + lösenord-autentisering med roller (user/admin). Lösenord
// hashas med bcrypt, sessionen bärs av en JWT. JWT_SECRET bör sättas i produktion.

const JWT_SECRET = process.env.JWT_SECRET ?? "nudgeme-dev-secret-byt-i-produktion";
const TOKEN_TTL = "30d";
/** Defaultlösen som admin-skapade konton får och tvingas byta vid första login. */
export const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD ?? "nudgeme";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Ej inloggad" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Ogiltig session" });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (getRole(req.userId!) !== "admin") {
    return res.status(403).json({ error: "Kräver admin." });
  }
  next();
}

const normalize = (u: string) => u.trim().toLowerCase();

function getRole(userId: string): string {
  const row = db.prepare("select role from users where id = ?").get(userId) as
    | { role: string }
    | undefined;
  return row?.role ?? "user";
}

/** Skapar användare + seedar startaktiviteter. Intern hjälpare. */
function createUser(
  username: string,
  password: string,
  role: "user" | "admin",
  mustChange: boolean,
): string {
  const uname = normalize(username);
  if (uname.length < 2) throw new HttpError(400, "Användarnamnet är för kort.");
  if (password.length < 6)
    throw new HttpError(400, "Lösenordet måste vara minst 6 tecken.");
  if (db.prepare("select 1 from users where username = ?").get(uname))
    throw new HttpError(409, "Användarnamnet är upptaget.");

  const id = randomUUID();
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "insert into users (id, username, password_hash, role, must_change_password, created_at) values (?,?,?,?,?,?)",
  ).run(id, uname, hash, role, mustChange ? 1 : 0, now);

  const insert = db.prepare(
    "insert into activities (id, user_id, title, frequency, tags, image_url, active, created_at) values (?,?,?,?,?,?,?,?)",
  );
  db.transaction(() => {
    for (const a of SEED_ACTIVITIES) {
      insert.run(randomUUID(), id, a.title, a.frequency, "[]", defaultImageDataUrl(a.title), 1, now);
    }
  })();
  return id;
}

interface Session {
  id: string;
  username: string;
  token: string;
  role: string;
  mustChangePassword: boolean;
}

/** Självregistrering. Testkontot blir admin. */
export function register(username: string, password: string): Session {
  const uname = normalize(username);
  const role = uname === "test" ? "admin" : "user";
  const id = createUser(username, password, role, false);
  return { id, username: uname, token: signToken(id), role, mustChangePassword: false };
}

export function login(username: string, password: string): Session {
  const uname = normalize(username);
  const row = db
    .prepare("select id, password_hash, role, must_change_password from users where username = ?")
    .get(uname) as
    | { id: string; password_hash: string; role: string; must_change_password: number }
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new HttpError(401, "Fel användarnamn eller lösenord.");
  }
  return {
    id: row.id,
    username: uname,
    token: signToken(row.id),
    role: row.role,
    mustChangePassword: !!row.must_change_password,
  };
}

/** Aktuell användares info (för /me). */
export function me(userId: string) {
  const row = db
    .prepare("select id, username, role, must_change_password from users where id = ?")
    .get(userId) as
    | { id: string; username: string; role: string; must_change_password: number }
    | undefined;
  if (!row) throw new HttpError(401, "Okänd användare.");
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: !!row.must_change_password,
  };
}

/** Byt lösenord (kräver nuvarande lösenord). Rensar tvingat-byte-flaggan. */
export function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const row = db.prepare("select password_hash from users where id = ?").get(userId) as
    | { password_hash: string }
    | undefined;
  if (!row || !bcrypt.compareSync(oldPassword, row.password_hash)) {
    throw new HttpError(401, "Nuvarande lösenord stämmer inte.");
  }
  if (newPassword.length < 6)
    throw new HttpError(400, "Nytt lösenord måste vara minst 6 tecken.");
  db.prepare(
    "update users set password_hash = ?, must_change_password = 0 where id = ?",
  ).run(bcrypt.hashSync(newPassword, 10), userId);
}

// --- Admin ---

export function adminCreateUser(username: string) {
  const id = createUser(username, DEFAULT_PASSWORD, "user", true);
  return { id, username: normalize(username), defaultPassword: DEFAULT_PASSWORD };
}

export function adminResetPassword(targetUserId: string) {
  const exists = db.prepare("select 1 from users where id = ?").get(targetUserId);
  if (!exists) throw new HttpError(404, "Användaren finns inte.");
  db.prepare(
    "update users set password_hash = ?, must_change_password = 1 where id = ?",
  ).run(bcrypt.hashSync(DEFAULT_PASSWORD, 10), targetUserId);
  return { defaultPassword: DEFAULT_PASSWORD };
}

export function listUsers() {
  return (
    db
      .prepare("select id, username, role, must_change_password from users order by username")
      .all() as { id: string; username: string; role: string; must_change_password: number }[]
  ).map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    mustChangePassword: !!r.must_change_password,
  }));
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
