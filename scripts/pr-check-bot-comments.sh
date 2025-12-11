#!/bin/bash

set -euo pipefail

# Thin wrapper to reuse pr-check-comments.sh with bots-only filtering
# Default to limiting to the first 5 items to prevent checklist overload
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# If caller passed an explicit --limit, preserve it; otherwise add --limit=5
PARGS=("--bots-only")
LIMIT_PASSED=false
for arg in "$@"; do
  case "$arg" in
    --limit=*) LIMIT_PASSED=true ;;
  esac
done

if [ "$LIMIT_PASSED" = false ]; then
  PARGS+=("--limit=5")
fi

"$SCRIPT_DIR/pr-check-comments.sh" "${PARGS[@]}" "$@"

