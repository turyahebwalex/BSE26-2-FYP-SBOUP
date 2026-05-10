#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# SBOUP — single-command dev launcher.
#
# Usage:
#     bash scripts/dev.sh
#
# What it does:
#   1. Runs scripts/setup.sh (idempotent — skips work already done).
#   2. Asks how you want to run the mobile app: Wi-Fi, USB, or skip.
#   3. Starts the Docker stack (backend, web client, AI services) detached.
#   4. Launches Expo in the chosen mode, with adb port-forwarding handled
#      automatically when you pick USB.
#
# To stop everything, Ctrl+C in this terminal — Docker is taken down on exit.
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[dev]${NC} $*"; }
warn() { echo -e "${YELLOW}[dev]${NC} $*"; }
fail() { echo -e "${RED}[dev]${NC} $*" >&2; exit 1; }

# 1. Bootstrap
bash "$ROOT_DIR/scripts/setup.sh"

# 2. Mobile mode picker
echo ""
echo "How would you like to run the mobile app?"
echo "  1) Wi-Fi  — scan QR in Expo Go (phone + laptop on the same Wi-Fi)"
echo "  2) USB    — phone plugged in with USB debugging on (faster reload)"
echo "  3) Skip   — only run backend + web client"
read -rp "Choice [1/2/3]: " choice

# Validate USB prerequisites BEFORE bringing up Docker, so a missing cable
# doesn't leave containers running for nothing.
if [[ "$choice" == "2" ]]; then
  if ! command -v adb >/dev/null 2>&1; then
    fail "adb is not installed. Install it with:  sudo apt install adb"
  fi
  if ! adb devices | tail -n +2 | grep -qE "[[:space:]]device$"; then
    warn "No authorised phone detected via USB. Checklist:"
    warn "  - Cable plugged in (try a different cable if unsure)"
    warn "  - USB mode set to 'File Transfer / MTP' (not charge-only)"
    warn "  - Developer options + USB debugging enabled on the phone"
    warn "  - Tapped 'Always allow' on the phone's authorisation popup"
    fail "Run 'adb devices' to verify, then re-run this script."
  fi
fi

# 3. Start the Docker stack detached so the terminal is free for Expo.
#
# The compose file ships a `mobile` service that boots Expo on host port
# 8081 — useful for collaborators who don't want Node locally, but it
# collides with the Expo we're about to start from the host (choices 1
# and 2). Even for choice 3 we don't need it, since 'skip' means no
# mobile at all. So always exclude it here, and clean up any stale
# instance from a prior run.
#
# Default: build only when an image is missing (Compose's normal
# behaviour). Pass `--build` to this script (or BUILD=1) to force a
# rebuild after Dockerfile / requirements changes. Forcing on every
# run kept tripping flaky campus links on multi-hundred-MB pip pulls.
#
# Pass `--pull` (or PULL=1) to fetch the latest images from GHCR before
# starting — teammates do this when CI has pushed new images. Skipped by
# default so an offline / weak link doesn't stall every dev session.
BUILD_FLAG=""
DO_PULL=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FLAG="--build" ;;
    --pull)  DO_PULL=1 ;;
    *) ;;
  esac
done
[[ "${BUILD:-}" == "1" ]] && BUILD_FLAG="--build"
[[ "${PULL:-}"  == "1" ]] && DO_PULL=1

if [[ "$DO_PULL" == "1" ]]; then
  log "Pulling latest images from GHCR (mongodb/redis pulled too)..."
  # --ignore-pull-failures so a temporarily-unauthenticated registry doesn't
  # block dev — Compose falls back to whatever's cached locally.
  docker compose pull --ignore-pull-failures || warn "Some pulls failed; using cached images."
fi

if [[ -n "$BUILD_FLAG" ]]; then
  log "Rebuilding and starting Docker stack..."
else
  log "Starting Docker stack from cached images (pass --build to rebuild, --pull to fetch latest from GHCR)..."
fi
docker compose rm -fs mobile >/dev/null 2>&1 || true
docker compose up $BUILD_FLAG -d --scale mobile=0

cleanup() {
  log "Stopping Docker stack..."
  docker compose down
}
trap cleanup EXIT INT TERM

# 4. Run mobile per choice
case "$choice" in
  1)
    log "Starting Expo in Wi-Fi (LAN) mode. Scan the QR with Expo Go."
    cd mobile && npm run start:wifi
    ;;
  2)
    log "Starting Expo in USB mode. Press 'a' in the Expo menu to open on your phone."
    cd mobile && npm run start:usb
    ;;
  3)
    log "Mobile skipped. Docker stack is running in the background."
    log "Tail logs with:  docker compose logs -f"
    log "Press Ctrl+C in this terminal to stop the stack."
    # Block until interrupted so the EXIT trap tears Docker down cleanly.
    while true; do sleep 3600; done
    ;;
  *)
    fail "Invalid choice: $choice (expected 1, 2, or 3)"
    ;;
esac
