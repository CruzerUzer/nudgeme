#!/bin/bash
# deploy-frontend.sh — Bygg NudgeMe-frontend LOKALT (server-läge) och synka till
# prod med rsync. Prod-VM:en har ~1 GB RAM och OOM-dödar `vite build`, så vi
# bygger på en dev-maskin och kopierar bara färdiga dist/.
#
# KRÄVER: ett eget godkännande från Adam innan körning (se DEPLOY.md / CLAUDE.md).
#
# Användning:
#   VITE_VAPID_PUBLIC_KEY=<prod-publik-nyckel> ./deploy/deploy-frontend.sh
#
# Miljövariabler:
#   PROD_SSH  (default: ubuntu@potterytracker.faris.se)
#   PROD_DIR  (default: /srv/NudgeMe)
#   PROD_URL  (default: https://nudgeme.faris.se)
#   VITE_VAPID_PUBLIC_KEY  (måste matcha serverns VAPID_PUBLIC_KEY, för push)

set -euo pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

PROD_SSH="${PROD_SSH:-ubuntu@potterytracker.faris.se}"
PROD_DIR="${PROD_DIR:-/srv/NudgeMe}"
PROD_URL="${PROD_URL:-https://nudgeme.faris.se}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}1/3 Bygger frontend lokalt (server-läge, samma-origin /api)...${NC}"
[ -d node_modules ] || npm install
# build:server sätter VITE_SERVER_MODE=1; VITE_VAPID_PUBLIC_KEY plockas från env.
npm run build:server
[ -f dist/index.html ] || { echo -e "${RED}dist/index.html saknas — avbryter.${NC}"; exit 1; }

echo -e "${YELLOW}2/3 Synkar dist/ → ${PROD_SSH}:${PROD_DIR}/dist/ ...${NC}"
rsync -az --delete \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=20" \
  dist/ "${PROD_SSH}:${PROD_DIR}/dist/"

echo -e "${YELLOW}3/3 Verifierar...${NC}"
CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$PROD_URL" || echo "000")
[ "$CODE" = "200" ] && echo -e "${GREEN}Klart — ${PROD_URL} svarar 200.${NC}" \
  || { echo -e "${RED}Varning: ${PROD_URL} svarade ${CODE}.${NC}"; exit 1; }
