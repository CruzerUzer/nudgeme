import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolerad temp-DB innan db.ts importeras (den läser NUDGEME_DB vid import).
const tmp = mkdtempSync(join(tmpdir(), "nudgeme-bg-"));
process.env.NUDGEME_DB = join(tmp, "test.db");

const { db } = await import("./db.js");
const { createPack, moveImage } = await import("./backgrounds.js");

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function seed(packId: string, screen: string) {
  db.prepare(
    "insert into background_images (id, pack_id, screen, path, mime) values (?,?,?,?, 'image/webp')",
  ).run(`${packId}-${screen}`, packId, screen, `/x/${screen}.webp`);
}
function screenOf(id: string) {
  return (db.prepare("select screen from background_images where id=?").get(id) as { screen: string }).screen;
}

let packId: string;
beforeAll(() => {
  packId = createPack("Testpaket").id;
  seed(packId, "home");
  seed(packId, "history");
});

test("byter plats på två bilder utan att bryta unique(pack_id, screen)", () => {
  moveImage(packId, "home", "history");
  expect(screenOf(`${packId}-home`)).toBe("history");
  expect(screenOf(`${packId}-history`)).toBe("home");
});

test("flyttar till tom slot", () => {
  moveImage(packId, "home", "settings"); // "home" är nu bilden `${packId}-history`
  expect(screenOf(`${packId}-history`)).toBe("settings");
  expect(db.prepare("select 1 from background_images where pack_id=? and screen='home'").get(packId)).toBeUndefined();
});

test("avvisar ogiltig skärm och tom källa", () => {
  expect(() => moveImage(packId, "home", "nonsense")).toThrow();
  expect(() => moveImage(packId, "home", "activities")).toThrow(/Ingen bild/);
});
