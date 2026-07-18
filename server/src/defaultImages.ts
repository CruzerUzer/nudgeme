import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Default-bilder för seed-aktiviteter. Lägg bildfiler i server/assets/defaults/
// namngivna efter aktivitetens "slug" (se den mappens README). Vid registrering
// bäddas matchande bild in som en data-URL i kontots aktivitet – origin-oberoende
// och självförsörjande, precis som användaruppladdade bilder.

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, "..", "assets", "defaults");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Titel -> filnamnsvänlig slug. "Tända ljus" => "tanda-ljus". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replaceAll("å", "a")
    .replaceAll("ä", "a")
    .replaceAll("ö", "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Returnerar en data-URL för aktivitetens default-bild, eller null om ingen finns. */
export function defaultImageDataUrl(title: string): string | null {
  const slug = slugify(title);
  for (const ext of Object.keys(MIME)) {
    const path = join(DIR, `${slug}.${ext}`);
    if (existsSync(path)) {
      const b64 = readFileSync(path).toString("base64");
      return `data:${MIME[ext]};base64,${b64}`;
    }
  }
  return null;
}
