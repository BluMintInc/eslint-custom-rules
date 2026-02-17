#!/bin/bash
# Track changes hook for Claude Code agent

# Persist stdin to a temp file to avoid passing large payloads via argv (prevents E2BIG)
TMP_FILE=$(mktemp -t track-changes-XXXXXX.json 2>/dev/null)
# Fallback if mktemp unavailable
if [ -z "$TMP_FILE" ] || [ ! -e "$TMP_FILE" ]; then
  TMP_FILE="/tmp/track-changes-$$-$(date +%s).json"
fi

# Ensure cleanup on exit
cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

# Read stdin into the temp file
cat > "$TMP_FILE"

# If no input was provided, exit silently
if [ ! -s "$TMP_FILE" ]; then
  exit 0
fi

# Try to extract workspace root using available tools
# Claude uses 'cwd', Cursor uses 'workspace_roots'
if command -v jq >/dev/null 2>&1; then
  WORKSPACE_ROOT=$(jq -r '.cwd // .workspace_roots[0] // empty' "$TMP_FILE" 2>/dev/null)
elif command -v python3 >/dev/null 2>&1; then
  WORKSPACE_ROOT=$(python3 - "$TMP_FILE" 2>/dev/null <<'PY'
import json, sys, pathlib
path = pathlib.Path(sys.argv[1])
with path.open() as f:
    data = json.load(f)
cwd = data.get("cwd")
roots = data.get("workspace_roots", [])
print(cwd or (roots[0] if roots else ""))
PY
)
else
  # Simple grep/sed extraction for cwd
  WORKSPACE_ROOT=$(grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' "$TMP_FILE" | sed 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
  if [ -z "$WORKSPACE_ROOT" ]; then
    WORKSPACE_ROOT=$(grep -o '"workspace_roots"[[:space:]]*:\[[[:space:]]*"[^"]*"' "$TMP_FILE" | sed 's/.*"workspace_roots"[[:space:]]*:\[[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
  fi
fi

# Fallback to git root if workspace_root not found or empty
if [ -z "$WORKSPACE_ROOT" ] || [ "$WORKSPACE_ROOT" = "null" ]; then
  WORKSPACE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
fi

# If we found a workspace root, change to it
if [ -n "$WORKSPACE_ROOT" ] && [ -d "$WORKSPACE_ROOT" ]; then
  cd "$WORKSPACE_ROOT" || { echo "Error: Failed to change directory to $WORKSPACE_ROOT" >&2; exit 1; }
fi

# Calculate the path to the TS script
TS_SCRIPT="scripts/claude-hooks/track-changes.ts"

# Pass the JSON input file path via env to keep argv small and avoid large pipes
JSON_INPUT_FILE="$TMP_FILE" npx tsx "$TS_SCRIPT"
