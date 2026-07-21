#!/bin/bash
# nudgeme-backup.sh — körs PÅ prod-VM:en. Säker hot-backup av NudgeMes SQLite
# (via better-sqlite3:s online-backup) + uppladdade bakgrundsbilder.
# Läggs på daglig cron och körs även före varje uppdatering.
set -euo pipefail

APP_DIR="${NUDGEME_DIR:-/srv/NudgeMe}"
BACKUP_ROOT="${NUDGEME_BACKUPS:-/srv/nudgeme-backups}"
KEEP="${NUDGEME_KEEP:-14}"     # antal backuper att behålla

cd "$APP_DIR/server"
TS=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_ROOT/nudgeme_backup_$TS"
mkdir -p "$DEST"

# Hot-backup av databasen (konsekvent även medan servern kör, WAL).
node -e "
const db = require('better-sqlite3')('data/nudgeme.db');
db.backup('$DEST/nudgeme.db')
  .then(() => { console.log('DB-backup klar'); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
"

# Uppladdade bilder (bakgrundspaket).
if [ -d data/uploads ]; then
  cp -r data/uploads "$DEST/uploads"
fi

# Behåll bara de senaste KEEP.
ls -1dt "$BACKUP_ROOT"/nudgeme_backup_* 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -rf

echo "Backup: $DEST"
