#!/bin/bash
# update-nudgeme.sh — Ett kommando för att uppdatera prod (körs från dev-maskin).
# Gör: backup av prod-data → bygg frontend lokalt → rsync → uppdatera backend
# (git pull + install + pm2 restart) → verifiera.
#
# KRÄVER Adams ok (se CLAUDE.md). Frontend byggs lokalt (VM:en OOM:ar på bygge).
# Prod-VAPID-publiknyckel plockas automatiskt från .env.production.local.

set -euo pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

PROD_SSH="${PROD_SSH:-ubuntu@potterytracker.faris.se}"
PROD_DIR="${PROD_DIR:-/srv/NudgeMe}"
PROD_URL="${PROD_URL:-https://nudgeme.faris.se}"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=20"

cd "$(dirname "${BASH_SOURCE[0]}")"

echo -e "${YELLOW}1/5 Backup av prod-data...${NC}"
ssh $SSH_OPTS "$PROD_SSH" "$PROD_DIR/deploy/nudgeme-backup.sh"

echo -e "${YELLOW}2/5 Bygger frontend lokalt (server-läge)...${NC}"
npm run build:server
[ -f dist/index.html ] || { echo -e "${RED}dist/index.html saknas — avbryter.${NC}"; exit 1; }

echo -e "${YELLOW}3/5 Synkar frontend → prod...${NC}"
rsync -az --delete -e "ssh $SSH_OPTS" dist/ "$PROD_SSH:$PROD_DIR/dist/"

echo -e "${YELLOW}4/5 Uppdaterar backend (git pull + install + restart)...${NC}"
ssh $SSH_OPTS "$PROD_SSH" "
  set -e
  cd $PROD_DIR && git pull
  cd server && npm install --omit=dev
  pm2 restart nudgeme-api && pm2 save
"

echo -e "${YELLOW}5/5 Verifierar...${NC}"
sleep 3
CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$PROD_URL/api/registration-status" || echo "000")
[ "$CODE" = "200" ] && echo -e "${GREEN}Klart — $PROD_URL uppdaterad och svarar.${NC}" \
  || { echo -e "${RED}Varning: API svarade $CODE. Kontrollera pm2 logs nudgeme-api.${NC}"; exit 1; }
