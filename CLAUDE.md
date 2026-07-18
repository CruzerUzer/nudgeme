# CLAUDE.md

Arbetsregler och projektkontext för Claude Code i det här repot.

## Arbetsregler (viktigast)

- **Gör alltid ändringar på en egen branch** — aldrig commits direkt på `main`.
  Skapa en beskrivande branch (t.ex. `feature/inloggning`, `fix/snooze-status`)
  och öppna PR mot `main`.
- **Fråga alltid Adam innan deploy till produktion.** Bygge och lokala tester
  får köras fritt, men produktionsdeploy (t.ex. Supabase functions deploy,
  hosting av frontend, cron-schemaläggning) sker aldrig utan uttryckligt ja.
- Svara på svenska. Förklara tekniska begrepp kort i förbifarten.

## Vad NudgeMe är

Mobil-först PWA som snällt (aldrig tvingande) påminner om roliga/utvecklande
aktiviteter. Slumpade nudges inom valbara tidsspann per veckodag,
frekvensklasser A–D med justerbara tak per aktivitet, kvittering + livscykel,
"Överraska mig" på begäran, fyra notisnivåer, historik och viloläge. Tema:
alviskt/natur/romantasy med humoristisk copy.

## Kommandon

```bash
npm run dev        # dev-server (porten allokeras via Helm: helmctl port claim nudgeme)
npm run build      # typecheck (tsc -b) + produktionsbygge
npm run test       # enhetstester (Vitest)
node scripts/gen-icons.mjs   # regenerera PWA-ikoner
```

Verifiera alltid med `npm run build` + `npm run test` innan en PR. Vid
UI-ändringar: kör dev-servern och ta gärna en skärmbild (mobilvy 390px).

## Arkitektur

- **Frontend:** React + Vite + TypeScript, PWA. Tailwind med design tokens i
  `tailwind.config.js`; global stil i `src/index.css`.
- **Datakälla-abstraktion:** `src/lib/db/store.ts` (`DataStore`) med två
  implementationer — `LocalStore` (localStorage + IndexedDB för bilder, körs
  utan backend) och `LocalServerStore` (multi-user mot den lokala servern).
  `getStore()` i `src/lib/db/index.ts` väljer källa: `VITE_API_URL` satt → server.
- **Kärnlogik (ren + testad):** `src/lib/nudge/` — `selection.ts` (frekvenstak,
  urval), `schedule.ts` (tidsspann, nästa nudge), `service.ts` (`NudgeService`:
  livscykel, auto-ignorering, "Överraska mig").
- **Copy/röst:** all humoristisk text i `src/copy/voice.ts`.
- **Backend (lokal server):** `server/` — Node + Express + SQLite +
  användarnamn/lösenord (bcrypt + JWT). Nudge-motorn som worker (`engine.ts`).
  Klienten pratar med den via `LocalServerStore` när `VITE_API_URL` är satt.
  (Supabase har tagits bort – appen är helt självdriven.)
- **Push:** Web Push (VAPID) + service worker-hanterare i
  `public/push-handler.js`.

## Konventioner

- Aldrig hårdkoda dev-portar — begär via Helm (`helmctl port claim <service>`).
- Håll affärslogik i `src/lib/nudge/` som rena funktioner med tester; UI:t tunt.
- En aktivitet har exakt en valfri bild (`imageUrl`). Seeda inga bilder.
- Se `TODO.md` för medvetet uppskjutet arbete.
