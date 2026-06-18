#!/bin/bash
# Stop all SBOUP local services
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"

echo "Stopping SBOUP services..."
pkill -f "run.py"         2>/dev/null && echo "  ✓ Fraud Detection stopped" || echo "  - Fraud Detection not running"
pkill -f "src/server.js"  2>/dev/null && echo "  ✓ Node Server stopped"    || echo "  - Node Server not running"
pkill -f "react-scripts"  2>/dev/null && echo "  ✓ React Client stopped"   || echo "  - React Client not running"
echo "Done."
