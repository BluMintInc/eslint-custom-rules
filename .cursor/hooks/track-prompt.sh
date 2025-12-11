#!/bin/bash
set -euo pipefail
# Track prompt hook for Cursor agent

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_SCRIPT="$(cd "$SCRIPT_DIR/../.." && pwd)/scripts/cursor-hooks/common.sh"
source "$COMMON_SCRIPT"

TS_SCRIPT="scripts/cursor-hooks/track-prompt.ts"
echo "$JSON_INPUT" | npx tsx "$TS_SCRIPT"
