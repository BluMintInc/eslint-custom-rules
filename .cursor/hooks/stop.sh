#!/bin/bash
# Stop hook for Cursor agent

# Read stdin into a variable
JSON_INPUT=$(cat)

# Try to extract workspace_root using available tools
if command -v jq >/dev/null 2>&1; then
  WORKSPACE_ROOT=$(echo "$JSON_INPUT" | jq -r '.workspace_roots[0] // empty' 2>/dev/null)
elif command -v python3 >/dev/null 2>&1; then
  WORKSPACE_ROOT=$(echo "$JSON_INPUT" | python3 -c "import sys, json; data = json.load(sys.stdin); roots = data.get('workspace_roots', []); print(roots[0] if roots else '')" 2>/dev/null)
else
  # Simple grep/sed extraction
  WORKSPACE_ROOT=$(echo "$JSON_INPUT" | grep -o '"workspace_roots"[[:space:]]*:\[[[:space:]]*"[^"]*"' | sed 's/.*"workspace_roots"[[:space:]]*:\[[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
fi

# Abort when workspace root is unavailable to avoid running relative paths in the wrong directory
if [ -z "$WORKSPACE_ROOT" ]; then
  echo "Workspace root not provided; aborting stop hook." >&2
  exit 1
fi

if [ ! -d "$WORKSPACE_ROOT" ]; then
  echo "Workspace root '$WORKSPACE_ROOT' not found; aborting stop hook." >&2
  exit 1
fi

cd "$WORKSPACE_ROOT" || exit 1

# Calculate the path to the TS script
# It is located in scripts/cursor-hooks/ relative to the workspace root
TS_SCRIPT="scripts/cursor-hooks/agent-check.ts"

# Pass the JSON input to the TS script via stdin
echo "$JSON_INPUT" | npx tsx "$TS_SCRIPT"

