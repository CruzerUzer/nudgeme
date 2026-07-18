// Genererar PWA-ikoner från en inline-SVG (alviskt löv på skogsgrön botten).
// Körs vid behov: `node scripts/gen-icons.mjs`. Kräver devDep @resvg/resvg-js.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function svg({ maskable }) {
  // Maskable behöver luft runt motivet (safe zone ~10%).
  const pad = maskable ? 90 : 40;
  const s = 512;
  const leafScale = (s - pad * 2) / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f4a3c"/>
      <stop offset="1" stop-color="#47603a"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${maskable ? 0 : 96}" fill="url(#bg)"/>
  <g transform="translate(${pad} ${pad}) scale(${leafScale})">
    <path d="M4 20c0-8 6-14 16-16-1 10-6 16-14 16-1 0-2-.3-2-.3S4 20 4 20Z"
          fill="none" stroke="#c9a24b" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M6 18C10 14 14 10 18 6" fill="none" stroke="#e8d3a0" stroke-width="1.1" stroke-linecap="round"/>
  </g>
</svg>`;
}

function render(svgStr, size) {
  const r = new Resvg(svgStr, { fitTo: { mode: "width", value: size } });
  return r.render().asPng();
}

const base = svg({ maskable: false });
writeFileSync(join(outDir, "icon-192.png"), render(base, 192));
writeFileSync(join(outDir, "icon-512.png"), render(base, 512));
writeFileSync(join(outDir, "icon-512-maskable.png"), render(svg({ maskable: true }), 512));
console.log("Ikoner genererade i public/icons/");
