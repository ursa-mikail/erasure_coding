#!/usr/bin/env bash
set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${CYAN}[ERASURE]${NC} Stopping all services..."
docker compose down --remove-orphans --timeout 15
echo -e "${GREEN}[  OK  ]${NC} All containers stopped and removed."
