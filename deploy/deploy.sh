#!/usr/bin/env bash
#
# Spielt den aktuellen Stand auf den Server und baut ihn dort.
#
#   ./deploy/deploy.sh root@179.198.197.248
#
# Voraussetzungen auf dem Server: Docker mit Compose-Plugin, und eine ausgefuellte
# .env unter $REMOTE_DIR (Vorlage: .env.production.example).
#
# Der Zugriff laeuft ueber deinen SSH-Key. Passwoerter gehoeren nicht in Scripts.
set -euo pipefail

HOST="${1:?Aufruf: ./deploy/deploy.sh benutzer@host}"
REMOTE_DIR="${REMOTE_DIR:-/opt/hipp-hoppers}"

echo "==> Quellstand nach ${HOST}:${REMOTE_DIR}"
ssh "$HOST" "mkdir -p '${REMOTE_DIR}'"

# --delete haelt den Server sauber; .env ist ausgeschlossen und bleibt deshalb
# sowohl vom Ueberschreiben als auch vom Loeschen verschont.
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'coverage' \
  --exclude '.claude' \
  ./ "${HOST}:${REMOTE_DIR}/"

echo "==> Bauen und starten"
ssh "$HOST" "cd '${REMOTE_DIR}' && docker compose up -d --build"

echo "==> Status"
ssh "$HOST" "cd '${REMOTE_DIR}' && docker compose ps"

echo
echo "Logs verfolgen:  ssh ${HOST} 'cd ${REMOTE_DIR} && docker compose logs -f app'"
