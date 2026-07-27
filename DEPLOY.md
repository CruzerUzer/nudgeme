# NudgeMe – produktionssättning

> ⚠️ **Deploya aldrig utan Adams uttryckliga ja varje gång.** Dev-servern
> (hemmalinux) har SSH-behörighet till prod, men inget körs mot prod utan
> godkännande. (Se `CLAUDE.md`.)

## Mål
NudgeMe på **https://nudgeme.faris.se**, på samma Oracle-VM som PotteryTracker.
Vi kopierar PotteryTrackers mönster: egen katalog, egen port, egen nginx-
serverblock + certbot, egen PM2-process, egen SQLite.

## Prod-miljön (från PotteryTracker)
- **Host:** `ubuntu@potterytracker.faris.se` (publik IP `129.151.211.25`), Oracle
  Cloud VM, ~1 GB RAM + 2 GB swap, passwordless sudo för `ubuntu`.
- **Reverse proxy:** nginx (`/etc/nginx/sites-available/*` → symlänk i `sites-enabled/`).
- **TLS:** Certbot (Let's Encrypt), HTTP→HTTPS-redirect.
- **Process-manager:** PM2 under användaren `ubuntu` (håll allt under *ett* konto).
- **DB:** SQLite (filbaserad, ingen DB-server).
- ⚠️ **Bygg aldrig frontend på VM:en** — `vite build` OOM-dödas. Bygg lokalt +
  rsync (se `deploy/deploy-frontend.sh`).

## NudgeMe-specifikt
- **Katalog:** `/srv/NudgeMe` (dist/ + server/).
- **Backend-port:** välj en ledig, t.ex. **3002** (PotteryTracker = 3001).
- **Frontend:** byggs i **server-läge** (`npm run build:server` → `VITE_SERVER_MODE=1`),
  pratar relativt mot `/api` som nginx proxar till backend. Ingen hårdkodad host.
- **Backend:** Node + Express + nudge-motor (setInterval) + SQLite. Körs med
  `tsx` (nu ett runtime-beroende) via PM2. Motorn kräver ingen separat cron.
- **Native moduler:** `better-sqlite3` och `sharp` — `npm install` på VM:en hämtar
  prebuilt-binärer för VM:ens arkitektur (verifiera med `uname -m`; finns build
  saknas: installera `build-essential python3`).

---

## Förberedelser (görs innan deploy)
1. **DNS:** lägg A-post `nudgeme.faris.se` → `129.151.211.25`.
2. **VAPID-nycklar (prod):** `npx web-push generate-vapid-keys` — den *publika*
   nyckeln måste både bakas in i frontend-bygget och sättas på backend.
3. **JWT_SECRET (prod):** generera en lång slumpsträng.
4. **GitHub:** repo `CruzerUzer/nudgeme` – VM:en klonar därifrån.

## Deploy – steg för steg (kräver godkännande)

### 1. Kod på VM:en
```bash
ssh ubuntu@potterytracker.faris.se
sudo mkdir -p /srv/NudgeMe && sudo chown ubuntu:ubuntu /srv/NudgeMe
git clone https://github.com/CruzerUzer/nudgeme /srv/NudgeMe
```

### 2. Backend-beroenden + env
```bash
cd /srv/NudgeMe/server
npm install --omit=dev          # tsx + native moduler (prebuilt)
mkdir -p data                   # SQLite + uploads hamnar här
cat > .env <<'ENV'
PORT=3002
JWT_SECRET=<lång-slump>
VAPID_PUBLIC_KEY=<prod-publik>
VAPID_PRIVATE_KEY=<prod-privat>
VAPID_SUBJECT=mailto:medlem@faris.se
# NUDGEME_DB=/srv/NudgeMe/server/data/nudgeme.db   (default räcker)
ENV
```

### 3. Frontend (bygg lokalt, synka)
Från dev-maskinen (hemmalinux):
```bash
VITE_VAPID_PUBLIC_KEY=<prod-publik> ./deploy/deploy-frontend.sh
```
(Bygger `dist/` i server-läge och rsync:ar till `/srv/NudgeMe/dist/`.)

### 4. Starta backend med PM2
```bash
cd /srv/NudgeMe/server
pm2 start npm --name nudgeme-api -- start   # kör `tsx src/index.ts`, läser .env
pm2 save                                    # persistens över omstart
# (pm2 startup är redan konfigurerat för ubuntu av PotteryTracker)
```

### 5. nginx
```bash
sudo cp /srv/NudgeMe/deploy/nginx-nudgeme.conf /etc/nginx/sites-available/nudgeme
sudo sed -i 's/<BACKEND_PORT>/3002/' /etc/nginx/sites-available/nudgeme
sudo ln -s /etc/nginx/sites-available/nudgeme /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 6. TLS
```bash
sudo certbot --nginx -d nudgeme.faris.se
```

### 7. Verifiera
- `https://nudgeme.faris.se` laddar, service worker registreras.
- Registrera/logga in, aktivera notiser på en telefon (installerad PWA), få en nudge.
- Backgrunder, admin, historik fungerar.

---

## Uppdateringar efteråt
- **Allt i ett steg (rekommenderat):** `./update-nudgeme.sh` från dev-maskinen.
  Gör: backup av prod-data → bygg frontend lokalt (`build:server`) → rsync →
  `git pull` + `npm install --omit=dev` + `pm2 restart nudgeme-api` på VM:en →
  verifierar `https://nudgeme.faris.se/api/registration-status`. Kräver Adams OK.
  (En 502 direkt efter restart är oftast bara `tsx` som kallstartar – verifiera
  om med `curl --retry`.)
  **OBS:** `build:server` skriver över den delade `dist/` → bygg om testinstansen
  med `build:test` efteråt (se Testinstans-avsnittet).
- **Bara frontend:** `./deploy/deploy-frontend.sh` (bygg lokalt + rsync).
- **Prod-branch:** VM:en står på `main` och gör `git pull` – merga till `main`
  och pusha innan `update-nudgeme.sh` körs.

> ⚠️ **`main` har skrivits om (force-push 2026-07-27) — VM:en behöver en
> engångsåtgärd vid NÄSTA deploy.** Historiken skrevs om för att ta bort ett
> användarnamn ur två commit-meddelanden, så alla commit-hashar från den gamla
> `08df05d` och framåt är utbytta. VM:ens klon har kvar den gamla historiken, så
> ett vanligt `git pull` slutar i "divergent branches" och `update-nudgeme.sh`
> stannar. Kör detta på VM:en en gång först (den är bara en klon – inget eget
> arbete finns där):
> ```bash
> ssh ubuntu@potterytracker.faris.se
> cd <repo-katalogen> && git fetch origin && git reset --hard origin/main
> ```
> Därefter fungerar `git pull` som vanligt igen. **Lärdom:** skriv aldrig om
> publicerad historik utan att räkna med att prod-klonen måste rätas upp för
> hand — regeln om användarnamn i `CLAUDE.md` finns för att slippa det här.

### Om-koda befintliga bakgrundsbilder på prod (engångs)
Nya uppladdningar skalas i `server/src/backgrounds.ts` (1280 px, WebP q58), men
redan uppladdade bilder ligger kvar i sin gamla storlek. För att krympa ett
befintligt paket på plats: säkerhetskopiera filerna, kör `sharp(...).resize(1280,
1280,{fit:"inside"}).webp({quality:58})` över varje fil (skriv temp → `rename`),
behåll DB-raderna. (Så gjordes paketet "Bäck": 1,13 MB → 535 KB.)

## Testinstans (HTTPS via Tailscale)
En separat, visuellt distinkt PWA ("NudgeMe TEST") körs på dev-maskinen så att
test och prod kan ligga parallellt på samma telefon. Nås **bara i tailnet**.

- **URL:** `https://hemmalinux.taila35f69.ts.net:8443`
- **Kedja:** Tailscale serve (`:8443`) → `vite preview` på `127.0.0.1:4305` →
  `/api`-proxy → dev-backend på `:4303`.
- **Portar (Helm-allokerade, hårdkoda inte nya):** backend `4303`, preview `4305`.
- **Dev-backend:** egen SQLite (`server/data/nudgeme.db`) + uploads
  (`server/data/uploads/`), skild från prod. VAPID i `server/.env`.
- **Test-bygget** använder *dev*-VAPID (inte prod), så publiknyckeln måste skickas
  inline – `.env.production.local` gäller annars alla produktionslägesbyggen:
  ```bash
  DEVPUB=$(grep VITE_VAPID_PUBLIC_KEY .env.local | cut -d= -f2-)
  VITE_VAPID_PUBLIC_KEY="$DEVPUB" npm run build:test   # → dist/ (titel "NudgeMe TEST", röd ikon)
  ```
- **Starta om (om de dött, t.ex. efter reboot – de körs via `nohup`, ingen PM2):**
  ```bash
  # backend
  cd server && nohup setsid bash -c 'PORT=4303 exec npm start' >/tmp/nudgeme-api.log 2>&1 </dev/null & disown
  # preview (serverar dist/ från senaste build:test)
  nohup setsid bash -c 'exec npx vite preview --host 127.0.0.1 --port 4305' >/tmp/nudgeme-preview.log 2>&1 </dev/null & disown
  # tailscale (om serve-regeln försvunnit)
  tailscale serve --bg --https=8443 http://127.0.0.1:4305
  ```
- **Uppdatera test:** kör `build:test` (ovan) igen; `vite preview` serverar
  `dist/` direkt från disk. Ladda om PWA:n; stäng/öppna en gång så nya service
  workern tar över (iPhone kan kräva ta bort + lägg till på hemskärmen igen).

### Fällor & tips (test)
- **Dev-backenden körs utan watch** (`npm start` = ren `tsx`). Ändringar i
  `server/` slår INTE igenom på testinstansen förrän backenden startas om (se
  omstartskommandot ovan). Klient-ändringar kräver `build:test`.
- **Rör ändringen både frontend OCH `server/` (t.ex. en ny route + UI som anropar
  den)? Då krävs BÅDE `build:test` OCH backend-omstart.** Bara `build:test` bygger
  om frontend — då anropar den nya klientkoden en route som inte finns i den
  körande (gamla) backend-processen, och symptomet blir "knappen gör ingenting"
  utan tydligt fel. Lärdom från #36 (byt-plats-bilder): frontend byggdes men
  backenden glömdes → bytet skedde aldrig förrän backenden startades om.
- **Döda ALDRIG backenden med `pkill -f "tsx src/index.ts"`** — mönstret matchar
  ditt eget skalkommando och SIGTERM:ar din egen körning mitt i. Rikta mot
  porten/PID istället (`ss -ltnp | grep :4303`), eller starta bara om den (den är
  ofta redan död).
- **Testa serverlogik utan inloggning:** registrering är avstängd på test-backenden
  (`/api/registration-status` → `{"open":false}`) och det finns inga slask-
  credentials → gå inte via API:t. Kör istället den *riktiga* server-koden mot en
  temp-DB (DB-sökvägen är env-styrd):
  ```bash
  cd server && NUDGEME_DB=/tmp/x.db npx tsx <script>.mts   # importera repo/motorn isolerat
  ```
  (Så verifierades t.ex. offline-`done`-guarden i `repo.upsertNudge`.)

> ⚠️ **`dist/` är delad — varje fullt bygge kapar testinstansen.**
> `vite preview` (:4305) läser `dist/` **live från disk**. Alla byggen skriver
> till samma `dist/`: `npm run build` (lokalt läge), `npm run build:server`
> (prod-deploy) och `npm run build:test`. Kör du `build`/`build:server` skrivs
> test-PWA:n tyst över (fel titel/ikon, ev. ingen inloggning) tills nästa
> `build:test`. **Regler:**
> - Verifiera kod med `npm run typecheck` (rör inte `dist/`), aldrig `npm run build`.
> - **Efter varje prod-deploy** (`update-nudgeme.sh` kör `build:server`) — bygg om
>   testinstansen med `build:test` (se ovan) för att återställa den.
> - Verifiera alltid efteråt: `curl -s http://127.0.0.1:4305/ | grep '<title>'`
>   ska visa `NudgeMe TEST`.

## Data & backup
- SQLite: `/srv/NudgeMe/server/data/nudgeme.db`. Uppladdade bakgrunder:
  `/srv/NudgeMe/server/data/uploads/`. Lägg in i samma backup-rutin som
  PotteryTracker (`/srv/*-backups`).

## Att bekräfta med Adam innan vi kör
- Backend-port (3002?).
- Vem sätter DNS-posten (Adam via domänleverantören).
- Prod-VAPID + JWT_SECRET (genereras och läggs i `/srv/NudgeMe/server/.env`, ej i git).
