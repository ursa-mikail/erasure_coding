#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[ERASURE]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err()  { echo -e "${RED}[ ERR  ]${NC} $*"; }

PORTS=(3000 8080)

banner() {
cat << 'EOF'
  ╔══════════════════════════════════════════════════╗
  ║     ERASURE CODING DEMO — Docker Manager         ║
  ║     Reed-Solomon GF(256) · 10 Shards · RS(10,6)  ║
  ╚══════════════════════════════════════════════════╝
EOF
}

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Port $port occupied by PID(s): $pids — killing..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
    ok "Port $port cleared"
  else
    ok "Port $port is free"
  fi
}

clean_ports() {
  log "Checking ports: ${PORTS[*]}"
  for port in "${PORTS[@]}"; do
    kill_port "$port"
  done
}

docker_down() {
  log "Bringing down existing containers..."
  docker compose down --remove-orphans --timeout 15 2>/dev/null || true
  ok "Containers stopped"
}

docker_up() {
  log "Building and starting services..."
  docker compose up --build -d
  ok "Services started"
}

wait_healthy() {
  log "Waiting for services to be healthy..."
  local retries=30
  local count=0
  while [ $count -lt $retries ]; do
    if curl -sf http://localhost:8080/api/status >/dev/null 2>&1; then
      ok "Backend is healthy"
      break
    fi
    count=$((count + 1))
    echo -n "."
    sleep 2
  done
  echo ""
  if [ $count -eq $retries ]; then
    err "Backend did not become healthy in time"
    docker compose logs backend
    exit 1
  fi

  ok "Frontend available at http://localhost:3000"
  ok "Backend API at http://localhost:8080/api"
}

print_status() {
  echo ""
  log "Container status:"
  docker compose ps
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  🚀 Frontend:  http://localhost:3000${NC}"
  echo -e "${GREEN}  🔧 Backend:   http://localhost:8080/api${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

main() {
  banner
  docker_down
  clean_ports
  docker_up
  wait_healthy
  print_status
}

main "$@"
