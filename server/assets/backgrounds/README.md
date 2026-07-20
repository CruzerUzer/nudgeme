# Bakgrundsbilder – bildpaket

Ett **paket** är en mapp här med en bild per skärm. Mappar som läggs här seedas
automatiskt som "medföljande" paket när servern startar. (Admin kan även skapa
paket och ladda upp bilder direkt i appen under _Inställningar → Hantera
bakgrunder_ – de lagras då i `server/data/uploads/`.)

## Filnamnsschema

```
server/assets/backgrounds/<Paketnamn>/<skärm>.webp
```

- **Mappnamnet** blir paketets visningsnamn (t.ex. `Gryningsskog`).
- **Filnamnet** måste vara exakt skärm-nyckeln nedan. Format: `.webp` (rek), `.jpg` eller `.png`.

| Fil              | Skärm i appen |
| ---------------- | ------------- |
| `home.webp`      | Hem           |
| `activities.webp`| Aktiviteter   |
| `schedule.webp`  | Schema        |
| `history.webp`   | Historik      |
| `settings.webp`  | Inställningar  |

Exempel: `server/assets/backgrounds/Gryningsskog/home.webp`

## Tekniska tips
- **Format:** stående mobil, ca **9:16** (t.ex. 1080×1920). Servern skalar ändå ner till max 1600 px och konverterar uppladdningar till WebP.
- Appen lägger ett **pergament-scrim** över bilden för läsbarhet, så välj bilder med **lugna partier upptill** (där rubriker ligger) och undvik hög kontrast/skarp text i motivet.
- Håll paketet **stilmässigt sammanhållet** – samma ljus/palett på alla fem skärmar.

---

## Promptar

Klistra in i en bildgenerator (Midjourney, Adobe Firefly, Google Imagen eller
motsvarande). Lägg till `--ar 9:16` i Midjourney. Undvik text i bilden.

### Paket 1 – "Gryningsskog"
Basstil (lägg till på varje prompt): _painterly romantasy illustration, ethereal
misty forest at dawn, soft golden light, muted parchment and moss-green tones,
low contrast, dreamy atmosphere, empty airy space in the upper third for text,
vertical mobile wallpaper._

- `home.webp` — a gentle mossy path winding into a sunlit forest clearing, dew and drifting light
- `activities.webp` — a grove with ferns, wildflowers and birch trunks, dappled morning light
- `schedule.webp` — tall trees silhouetted against a pale dawn sky, soft mist between trunks
- `history.webp` — an ancient oak with gnarled roots and moss-covered stones, quiet and timeless
- `settings.webp` — a calm woodland nook with a still pond reflecting the sky

### Paket 2 – "Månglänta"
Basstil: _painterly romantasy illustration, moonlit forest glade at night, deep
teal and forest-green tones with soft silver light, faint golden fireflies,
serene and magical, low contrast, empty calm space in the upper third for text,
vertical mobile wallpaper._

- `home.webp` — a moonlit clearing with a soft glow, fireflies drifting over grass
- `activities.webp` — ferns and mushrooms under moonlight, gentle bioluminescent hints
- `schedule.webp` — a starry night sky seen through a canopy, crescent moon
- `history.webp` — a still lake mirroring the moon, ancient willow at the shore
- `settings.webp` — a quiet mossy hollow lit by a single warm lantern glow

### Paket 3 – "Höstlund"
Basstil: _painterly romantasy illustration, warm autumn grove, amber and honey
tones with soft golden light, falling leaves, cozy and nostalgic, low contrast,
empty warm space in the upper third for text, vertical mobile wallpaper._

- `home.webp` — a sunlit autumn path carpeted with golden leaves
- `activities.webp` — maples and oaks in amber and rust, drifting leaves
- `schedule.webp` — a soft hazy autumn sky through thinning branches
- `history.webp` — an old stone bridge over a leaf-strewn brook, warm light
- `settings.webp` — a snug forest corner with a woven basket and warm glow

---

## Bonus: ny favicon (stiliserat löv)

App-ikon / favicon – kvadratisk, funkar liten:

> _Minimalist app icon of a single stylized leaf, elegant gold line-art on a deep
> forest-green background, smooth rounded square, subtle central vein, calm and
> premium, flat vector, centered, generous padding, no text._

Exportera som **512×512 PNG** (och gärna en 192×192). Lägg PNG:erna i
`public/icons/` (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`) och en
`public/favicon.svg` om du har en vektor. Kör sedan `node scripts/gen-icons.mjs`
om du utgår från en SVG, eller ersätt PNG-filerna direkt.
