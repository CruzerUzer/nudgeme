# TODO

Framtida arbete som medvetet skjutits upp.

## Default-bilder – lägg in filerna
- Infrastrukturen är klar: lägg bildfiler i `server/assets/defaults/` namngivna
  efter aktivitetens slug (se den mappens `README.md`), så får nya konton
  automatiskt bild på matchande seed-aktivitet. **Väntar på att Adam laddar upp
  bilderna.**

## Full offline (fas 1 + 2 klara – fas 3 kvar)
- Se `OFFLINE.md` för hela ritningen. Kort: läs-cache (IndexedDB) + outbox för
  skrivningar som dekorerar `LocalServerStore`.
- **Fas 1 (läsning) + fas 2 (skrivning) implementerade** (`OfflineStore` +
  `offlineCache`): read-through-cache per userId, outbox med optimistiska
  uppdateringar + FIFO-replay vid online/fokus, `done`-terminal-guard på servern
  (`repo.upsertNudge`), offline-banner.
- **Kvar (fas 3):** Background Sync API (Android/Chrome), "Överraska mig" offline
  (återanvänd `selection.ts`/`schedule.ts` lokalt) och konfliktpolish.

## Testinstans – överlever inte reboot (medvetet nedprioriterat)
- Dev-backend (`:4303`) och `vite preview` (`:4305`) för test-PWA:n körs via
  `nohup`, inte under en process-manager, så de dör vid en omstart av hemmalinux
  och måste startas om för hand (kommandon i `DEPLOY.md` → "Testinstans").
  *Ev. framtida förbättring:* lägg dem under systemd/PM2 så testinstansen kommer
  upp automatiskt efter reboot. Inte brådskande – test startas sällan om.

## Produktion (kräver Adams OK innan deploy)
- Kör servern under en process-manager (t.ex. systemd eller pm2) istället för
  att starta manuellt; nudge-motorn är en `setInterval` i `startEngine`.
- Sätt ett eget långt `JWT_SECRET` (se `server/.env.example`).
- Aktivera web push: generera VAPID-nycklar, sätt `VAPID_*` på servern och
  `VITE_VAPID_PUBLIC_KEY` i frontend. HTTPS krävs (Tailscale serve) för att
  installera PWA:n och ta emot push, särskilt på iPhone.

## Klart tidigare
- ✅ Inloggnings-/registreringsvy (multi-user)
- ✅ Byt från Supabase till lokal databas + auth (Supabase helt borttaget)
- ✅ Bilder utanför localStorage (IndexedDB i lokalt läge)
- ✅ CLAUDE.md med arbetsregler (branch + fråga före produktion)
