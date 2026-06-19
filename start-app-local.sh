#!/bin/bash
# ============================================================
#  SBOUP — Start All Services Locally (No Docker)
# ============================================================
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

info()  { echo -e "${GREEN}[START]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Kill any previous instances ──────────────────────────────
info "Stopping any previous instances..."
pkill -f "run.py"          2>/dev/null || true
pkill -f "src/server.js"   2>/dev/null || true
pkill -f "react-scripts"   2>/dev/null || true
sleep 1

# ── 1. Check MongoDB ─────────────────────────────────────────
info "Checking MongoDB on port 27017..."
if ! mongosh --eval "db.runCommand({ping:1})" --quiet 2>/dev/null | grep -q "ok"; then
  warn "MongoDB not responding — trying to start it..."
  mongod --dbpath "$ROOT/.mongo-data" --fork --logpath "$LOG_DIR/mongodb.log" 2>/dev/null || \
    error "Could not start MongoDB. Please start it manually: sudo systemctl start mongod"
else
  info "MongoDB already running ✓"
fi

# ── 2. Start Fraud Detection Service (port 5002) ─────────────
info "Starting Fraud Detection service on port 5002..."
cd "$ROOT/ai-services/fraud-detection"
nohup .venv/bin/python run.py > "$LOG_DIR/fraud.log" 2>&1 &
echo $! > "$LOG_DIR/fraud.pid"
info "Fraud Detection PID: $(cat "$LOG_DIR/fraud.pid")"

# ── 3. Start Node.js Server (port 5000) ──────────────────────
info "Starting Node.js server on port 5000..."
cd "$ROOT/server"
nohup npm start > "$LOG_DIR/server.log" 2>&1 &
echo $! > "$LOG_DIR/server.pid"
info "Server PID: $(cat "$LOG_DIR/server.pid")"

# ── 4. Start React Client (port 3000) ────────────────────────
info "Starting React client on port 3000..."
cd "$ROOT/client"
nohup npm start > "$LOG_DIR/client.log" 2>&1 &
echo $! > "$LOG_DIR/client.pid"
info "Client PID: $(cat "$LOG_DIR/client.pid")"

# ── Wait and health check ─────────────────────────────────────
echo ""
info "Waiting for services to start (15 seconds)..."
sleep 15

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  SBOUP Services Status${NC}"
echo -e "${GREEN}============================================${NC}"

check_service() {
  local name=$1 url=$2
  if wget -qO- "$url" --timeout=3 >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $name → $url"
  else
    echo -e "  ${RED}✗${NC} $name → $url (may still be starting)"
  fi
}

check_service "Fraud Detection" "http://localhost:5002/api/health"
check_service "Node.js Server"  "http://localhost:5000/api/health"
check_service "React Client"    "http://localhost:3000"

echo ""
echo -e "  ${YELLOW}Logs:${NC}"
echo -e "    Fraud:   tail -f $LOG_DIR/fraud.log"
echo -e "    Server:  tail -f $LOG_DIR/server.log"
echo -e "    Client:  tail -f $LOG_DIR/client.log"
echo ""
echo -e "  ${YELLOW}Stop all:${NC} bash stop-app-local.sh"
echo ""
echo -e "${GREEN}  App ready at: http://localhost:3000${NC}"
echo -e "${GREEN}============================================${NC}"
