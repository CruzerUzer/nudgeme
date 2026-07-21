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
- **Bara frontend:** `./deploy/deploy-frontend.sh` (bygg lokalt + rsync).
- **Backend:** på VM:en `cd /srv/NudgeMe && git pull && cd server && npm install --omit=dev && pm2 restart nudgeme-api`.
- Överväg ett `update-nudgeme.sh` (som PotteryTrackers) som gör detta i ett steg.

## Data & backup
- SQLite: `/srv/NudgeMe/server/data/nudgeme.db`. Uppladdade bakgrunder:
  `/srv/NudgeMe/server/data/uploads/`. Lägg in i samma backup-rutin som
  PotteryTracker (`/srv/*-backups`).

## Att bekräfta med Adam innan vi kör
- Backend-port (3002?).
- Vem sätter DNS-posten (Adam via domänleverantören).
- Prod-VAPID + JWT_SECRET (genereras och läggs i `/srv/NudgeMe/server/.env`, ej i git).
