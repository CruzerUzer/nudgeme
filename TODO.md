# TODO

Framtida arbete som medvetet skjutits upp.

## Lägg till inloggnings-/registreringsvy (multi-user)
- Frontend saknar login/signup. `SupabaseStore` kräver en inloggad användare
  medan `LocalStore` använder en automatisk gäst. Bygg en enkel e-post-
  inloggning (magic link) för att aktivera multi-user på riktigt.

## Bilder för defaultanvändare
- Ladda upp bilder för de seedade default-aktiviteterna (ingen bild seedas i
  koden – `SEED_ACTIVITIES` i `src/lib/db/seed.ts` har inga `imageUrl`).
- I Supabase-läge: ladda upp aktivitetsbilder till **Supabase Storage** och
  spara bara URL:en i `activities.image_url` istället för data-URL i databasen
  (se `src/lib/image.ts`, som idag producerar en nedskalad data-URL för lokalt
  läge).

## ~~Byt från Supabase till lokal databas + autentisering~~ ✅ KLART
- Implementerat: lokal backend i `server/` (Node + Express + SQLite) med
  användarnamn/lösenord (bcrypt + JWT) och nudge-motorn som worker. Klienten
  har `LocalServerStore` + inloggningsvy; `getStore()` väljer server när
  `VITE_API_URL` är satt. Se README ("Multi-user med lokal server").
- Kvar (valfritt): Supabase-koden finns fortfarande kvar som alternativ. Om vi
  helt vill överge Supabase kan `src/lib/db/supabase.ts` +
  `supabase/`-mappen tas bort och beroendet `@supabase/supabase-js` avinstalleras.
- Kvar (valfritt): flytta serverns push-cron till en riktig process-manager
  (idag `setInterval` i `startEngine`), och hasha om JWT_SECRET i produktion.

## Överväg bildstorlek i lokalt läge
- Data-URL:er i `localStorage` kan bli stora. `fileToDataUrl` skalar ner till
  max 1000px/JPEG 0.82, men vid många bilder kan lagringstaket nås – överväg
  IndexedDB istället för localStorage för bilder.
