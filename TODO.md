# TODO

Framtida arbete som medvetet skjutits upp.

## Default-bilder – lägg in filerna
- Infrastrukturen är klar: lägg bildfiler i `server/assets/defaults/` namngivna
  efter aktivitetens slug (se den mappens `README.md`), så får nya konton
  automatiskt bild på matchande seed-aktivitet. **Väntar på att Adam laddar upp
  bilderna.**

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
