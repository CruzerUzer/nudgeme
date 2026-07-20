import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import sharp from "sharp";
import { db } from "./db.js";

// Bakgrundsbilder som "paket": ett paket har en bild per skärm. Admin bygger
// biblioteket; användaren väljer paket. Bilder lagras som FILER (inte data-URL i
// databasen) – medföljande paket i assets/backgrounds/, uppladdade i
// data/uploads/backgrounds/. background_images.path pekar på filen.

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(here, "..", "assets", "backgrounds");
const UPLOAD_DIR =
  process.env.NUDGEME_UPLOADS ?? join(here, "..", "data", "uploads", "backgrounds");
mkdirSync(UPLOAD_DIR, { recursive: true });

export const SCREENS = [
  "login",
  "home",
  "activities",
  "schedule",
  "history",
  "settings",
] as const;
export type Screen = (typeof SCREENS)[number];

const MIME: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/** Seeda medföljande paket från assets/backgrounds/<slug>/<screen>.<ext>. */
export function seedBuiltinPacks() {
  if (!existsSync(ASSETS_DIR)) return;
  for (const entry of readdirSync(ASSETS_DIR)) {
    const dir = join(ASSETS_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter((f) => MIME[extname(f).slice(1).toLowerCase()]);
    if (files.length === 0) continue;

    let pack = db
      .prepare("select id from background_packs where name = ? and builtin = 1")
      .get(entry) as { id: string } | undefined;
    if (!pack) {
      const id = randomUUID();
      db.prepare(
        "insert into background_packs (id, name, builtin, created_at) values (?,?,1,?)",
      ).run(id, entry, new Date().toISOString());
      pack = { id };
    }
    for (const f of files) {
      const screen = basename(f, extname(f)).toLowerCase();
      if (!SCREENS.includes(screen as Screen)) continue;
      if (db.prepare("select 1 from background_images where pack_id=? and screen=?").get(pack.id, screen))
        continue;
      const mime = MIME[extname(f).slice(1).toLowerCase()];
      db.prepare(
        "insert into background_images (id, pack_id, screen, path, mime) values (?,?,?,?,?)",
      ).run(randomUUID(), pack.id, screen, join(dir, f), mime);
    }
  }
}

export function listPacks() {
  const packs = db
    .prepare("select id, name, builtin from background_packs order by builtin desc, name")
    .all() as { id: string; name: string; builtin: number }[];
  const imgs = db.prepare("select id, pack_id, screen from background_images").all() as {
    id: string;
    pack_id: string;
    screen: string;
  }[];
  return packs.map((p) => ({
    id: p.id,
    name: p.name,
    builtin: !!p.builtin,
    images: imgs
      .filter((i) => i.pack_id === p.id)
      .map((i) => ({ screen: i.screen, url: `/api/backgrounds/image/${i.id}` })),
  }));
}

/**
 * Inloggningsskärmens bakgrund är app-övergripande (pre-auth, ingen användare
 * har valt paket ännu). Vi tar login-bilden från första paketet som har en,
 * med medföljande paket först.
 */
export function loginBackgroundUrl(): string | null {
  const row = db
    .prepare(
      `select i.id from background_images i
       join background_packs p on p.id = i.pack_id
       where i.screen = 'login'
       order by p.builtin desc, p.name
       limit 1`,
    )
    .get() as { id: string } | undefined;
  return row ? `/api/backgrounds/image/${row.id}` : null;
}

export function getImageFile(id: string): { path: string; mime: string } | null {
  const row = db.prepare("select path, mime from background_images where id = ?").get(id) as
    | { path: string; mime: string }
    | undefined;
  if (!row || !existsSync(row.path)) return null;
  return row;
}

export function createPack(name: string) {
  const clean = name.trim();
  if (clean.length < 1) throw new Error("Namn krävs.");
  const id = randomUUID();
  db.prepare(
    "insert into background_packs (id, name, builtin, created_at) values (?,?,0,?)",
  ).run(id, clean, new Date().toISOString());
  return { id, name: clean };
}

/** Ladda upp/ersätt en skärmbild i ett paket. Skalar ner till WebP. */
export async function addImage(packId: string, screen: string, buffer: Buffer) {
  if (!SCREENS.includes(screen as Screen)) throw new Error("Ogiltig skärm.");
  if (!db.prepare("select 1 from background_packs where id = ?").get(packId))
    throw new Error("Paketet finns inte.");

  const id = randomUUID();
  const out = join(UPLOAD_DIR, `${id}.webp`);
  await sharp(buffer)
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(out);

  const prev = db
    .prepare("select id, path from background_images where pack_id=? and screen=?")
    .get(packId, screen) as { id: string; path: string } | undefined;
  if (prev) {
    if (prev.path.startsWith(UPLOAD_DIR)) {
      try {
        rmSync(prev.path, { force: true });
      } catch {
        /* ignore */
      }
    }
    db.prepare("delete from background_images where id = ?").run(prev.id);
  }
  db.prepare(
    "insert into background_images (id, pack_id, screen, path, mime) values (?,?,?,?, 'image/webp')",
  ).run(id, packId, screen, out);
  return { id, screen };
}

export function deletePack(packId: string) {
  const imgs = db
    .prepare("select path from background_images where pack_id = ?")
    .all(packId) as { path: string }[];
  for (const i of imgs) {
    if (i.path.startsWith(UPLOAD_DIR)) {
      try {
        rmSync(i.path, { force: true });
      } catch {
        /* ignore */
      }
    }
  }
  db.prepare("delete from background_packs where id = ?").run(packId);
}
