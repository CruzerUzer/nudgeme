# TODO

Framtida arbete som medvetet skjutits upp.

## Default-bilder – lägg in filerna
- Infrastrukturen är klar: lägg bildfiler i `server/assets/defaults/` namngivna
  efter aktivitetens slug (se den mappens `README.md`), så får nya konton
  automatiskt bild på matchande seed-aktivitet. **Väntar på att Adam laddar upp
  bilderna.**

## Full offline (KLAR – alla tre faser)
- Se `OFFLINE.md` för hela ritningen. `OfflineStore` + `offlineCache` dekorerar
  `LocalServerStore`.
- **Fas 1–3 implementerade:** read-through-cache per userId, outbox med
  optimistiska uppdateringar + FIFO-replay (online/fokus/appstart + opportunistiskt
  vid lyckad läsning), `done`-terminal-guard på servern (`repo.upsertNudge`),
  "Överraska mig" offline, Background Sync (`public/push-handler.js` väcker öppna
  fönster; iOS → nästa öppning), offline-banner.
- Ev. framtida polish: visa antal köade ändringar i bannern; städa utgångna
  push-subs; migrera token till IDB om helt-stängd-app-replay i SW önskas.

## `PUT /api/engine` – rutt som ingen klient använder (öppen lucka)
- Nyckel/värde-loopen i `server/src/index.ts` exponerar `engine` för både GET och
  PUT. I serverläge skriver klienten **aldrig** motorns tillstånd
  (`saveEngineState` anropas bara från `NudgeService.scheduleNext`, som bara körs
  i lokalt läge) — så PUT-halvan är oanvänd.
- Varför det är värt att stänga: dygnsräknaren vaktar kvoten när nästa tidpunkt
  *schemaläggs*, inte när nudgen *levereras*. En klient som sätter `nextNudgeAt`
  till "nu" om och om igen kan alltså mata fram nudges förbi dygnstaket.
- Förslag: ta bort `engine` ur PUT-loopen (behåll GET), eller låt motorn
  kontrollera kvoten även vid leverans. Ej brådskande — kräver inloggning och
  drabbar bara det egna kontot.

## Testinstans – överlever inte reboot (medvetet nedprioriterat)
- Dev-backend (`:4303`) och `vite preview` (`:4305`) för test-PWA:n körs via
  `nohup`, inte under en process-manager, så de dör vid en omstart av hemmalinux
  och måste startas om för hand (kommandon i `DEPLOY.md` → "Testinstans").
  *Ev. framtida förbättring:* lägg dem under systemd/PM2 så testinstansen kommer
  upp automatiskt efter reboot. Inte brådskande – test startas sällan om.

## Klart tidigare
- ✅ **Dygnsräknaren i drift** (deployad + verifierad i prod 2026-07-30): tre
  konton, exakt 1 nudge var, alla på den fröade tiden på minuten, och
  `sentDayKey`/`sentCount` ifyllda i motorns kv. Bakgrund och fällor:
  `CLAUDE.md` → "En stabil plan räcker INTE".
- ✅ **Produktion i drift på `nudgeme.faris.se`** (verifierat 2026-07-28):
  backend under PM2 som `nudgeme-api`, eget `JWT_SECRET` och `VAPID_*` satta i
  `/srv/NudgeMe/server/.env`, push aktiverad, HTTPS via nginx + certbot.
  Drift och uppdateringar: `DEPLOY.md`. (Punkterna som stod här som framtida
  arbete var gjorda för länge sedan — kolla mot verkligheten innan du tror på en
  TODO.)
- ✅ Inloggnings-/registreringsvy (multi-user)
- ✅ Byt från Supabase till lokal databas + auth (Supabase helt borttaget)
- ✅ Bilder utanför localStorage (IndexedDB i lokalt läge)
- ✅ CLAUDE.md med arbetsregler (branch + fråga före produktion)
