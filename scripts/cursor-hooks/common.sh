#!/bin/bash
set -euo pipefail

# Read stdin once for all hook scripts
if [ -t 0 ]; then
  echo "common.sh expects JSON input via stdin" >&2
  exit 1
fi
JSON_INPUT="$(cat)"

# Extract workspace root with available tools
if command -v jq >/dev/null 2>&1; then
  WORKSPACE_ROOT="$(echo "$JSON_INPUT" | jq -r '.workspace_roots[0] // empty' 2>/dev/null)"
elif command -v python3 >/dev/null 2>&1; then
  WORKSPACE_ROOT="$(echo "$JSON_INPUT" | python3 - <<'PY' 2>/dev/null
import sys, json
data = json.load(sys.stdin)
roots = data.get("workspace_roots", [])
print(roots[0] if roots else "")
PY
)"
else
  WORKSPACE_ROOT="$(echo "$JSON_INPUT" | grep -o '"workspace_roots"[[:space:]]*:\[[[:space:]]*"[^"]*"' | sed 's/.*"workspace_roots"[[:space:]]*:\[[[:space:]]*"\([^"]*\)".*/\1/' | head -1)"
fi

if [ -z "${WORKSPACE_ROOT:-}" ]; then
  echo "Workspace root not provided; aborting hook." >&2
  exit 1
fi

if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo "Workspace root '$WORKSPACE_ROOT' not found; aborting hook." >&2
  exit 1
fi

cd "$WORKSPACE_ROOT"

export JSON_INPUT
export WORKSPACE_ROOT
