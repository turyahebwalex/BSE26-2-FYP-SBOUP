#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# SBOUP — first-run bootstrap for new team collaborators.
#
# After cloning and `git pull`, run this ONCE from the project root:
#
#     bash scripts/setup.sh
#
# It:
#   1. Copies every .env.example -> .env that doesn't already exist
#      (root, client/, mobile/, ai-services/*).
#   2. Installs Node dependencies for server, client and mobile.
#   3. Seeds the database with the shared demo users (admin / employer /
#      skilled_worker) so the whole team logs in with the SAME credentials.
#
# Demo users created by the seeder (all share one dev database):
#   admin@skillbridge.ug    Admin@12345
#   employer@demo.ug        Employer@12345
#   worker@demo.ug          Worker@12345
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
fail() { echo -e "${RED}[setup]${NC} $*" >&2; exit 1; }

copy_env() {
  local example="$1" target="$2"
  if [[ -f "$target" ]]; then
    warn "  skip: $target already exists"
  elif [[ -f "$example" ]]; then
    cp "$example" "$target"
    log "  created $target"
  fi
}

log "1/3  Creating .env files from .env.example where missing..."
copy_env "$ROOT_DIR/.env.example"        "$ROOT_DIR/.env"
copy_env "$ROOT_DIR/client/.env.example" "$ROOT_DIR/client/.env"
copy_env "$ROOT_DIR/mobile/.env.example" "$ROOT_DIR/mobile/.env"
for svc in ai-services/*/; do
  copy_env "$ROOT_DIR/$svc.env.example" "$ROOT_DIR/$svc.env"
done

# The server reads the root .env via a symlink at server/.env; recreate if missing.
if [[ ! -e "$ROOT_DIR/server/.env" ]]; then
  ln -s ../.env "$ROOT_DIR/server/.env"
  log "  created server/.env -> ../.env"
fi

if ! command -v node >/dev/null 2>&1; then
  warn "node not found on PATH — skipping npm installs and seed."
  warn "Either install Node 18+, or run via Docker: docker compose up --build"
  exit 0
fi

log "2/3  Installing Node dependencies (server, client, mobile)..."
( cd server && npm install --no-audit --no-fund )
( cd client && npm install --no-audit --no-fund )
( cd mobile && npm install --no-audit --no-fund )

log "3/3  Seeding the database with demo users..."

# Make sure MongoDB is reachable on localhost:27017 before seeding.
# Try Docker first (zero-config for collaborators); fall back to a system
# mongod the user may already be running.
ensure_mongo() {
  if ( exec 3<>/dev/tcp/127.0.0.1/27017 ) 2>/dev/null; then
    exec 3>&-; exec 3<&-
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    log "  MongoDB not reachable on 27017 — starting via Docker..."
    docker compose up -d mongodb redis >/dev/null
    for _ in $(seq 1 30); do
      if ( exec 3<>/dev/tcp/127.0.0.1/27017 ) 2>/dev/null; then
        exec 3>&-; exec 3<&-
        log "  MongoDB is up."
        return 0
      fi
      sleep 1
    done
    fail "MongoDB container started but never accepted connections on 27017."
  fi
  fail "MongoDB not running and Docker not installed. Start mongod (sudo systemctl start mongod) or install Docker, then re-run."
}

ensure_mongo

if ! ( cd server && npm run seed ); then
  fail "Seed failed even though MongoDB is reachable. Check the trace above."
fi

log "Done. Shared demo credentials:"
echo "    admin@skillbridge.ug     Admin@12345"
echo "    employer@demo.ug         Employer@12345"
echo "    worker@demo.ug           Worker@12345"
