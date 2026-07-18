import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db.js";
import { SEED_ACTIVITIES } from "./seed.js";
import { defaultImageDataUrl } from "./defaultImages.js";

// Användarnamn + lösenord-autentisering. Lösenord hashas med bcrypt, sessionen
// bärs av en JWT (Bearer-token). JWT_SECRET bör sättas i produktion.

const JWT_SECRET = process.env.JWT_SECRET ?? "nudgeme-dev-secret-byt-i-produktion";
const TOKEN_TTL = "30d";

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

const normalize = (u: string) => u.trim().toLowerCase();

export function register(username: string, password: string) {
  const uname = normalize(username);
  if (uname.length < 2) throw new HttpError(400, "Användarnamnet är för kort.");
  if (password.length < 6)
    throw new HttpError(400, "Lösenordet måste vara minst 6 tecken.");

  const exists = db.prepare("select 1 from users where username = ?").get(uname);
  if (exists) throw new HttpError(409, "Användarnamnet är upptaget.");

  const id = randomUUID();
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "insert into users (id, username, password_hash, created_at) values (?,?,?,?)",
  ).run(id, uname, hash, now);

  // Seeda startaktiviteter för det nya kontot.
  const insert = db.prepare(
    "insert into activities (id, user_id, title, frequency, tags, image_url, active, created_at) values (?,?,?,?,?,?,?,?)",
  );
  const seed = db.transaction(() => {
    for (const a of SEED_ACTIVITIES) {
      const image = defaultImageDataUrl(a.title); // null om ingen fil finns
      insert.run(randomUUID(), id, a.title, a.frequency, "[]", image, 1, now);
    }
  });
  seed();

  return { id, username: uname, token: signToken(id) };
}

export function login(username: string, password: string) {
  const uname = normalize(username);
  const row = db
    .prepare("select id, password_hash from users where username = ?")
    .get(uname) as { id: string; password_hash: string } | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new HttpError(401, "Fel användarnamn eller lösenord.");
  }
  return { id: row.id, username: uname, token: signToken(row.id) };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
