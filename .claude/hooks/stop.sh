#!/bin/bash
# Stop hook for Claude Code agent

# Read stdin into a variable
JSON_INPUT=$(cat)

# Try to extract workspace root using available tools
# Claude uses 'cwd', Cursor uses 'workspace_roots'
if command -v jq >/dev/null 2>&1; then
  WORKSPACE_ROOT=$(printf '%s' "$JSON_INPUT" | jq -r '.cwd // .workspace_roots[0] // empty' 2>/dev/null)
elif command -v python3 >/dev/null 2>&1; then
  WORKSPACE_ROOT=$(printf '%s' "$JSON_INPUT" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('cwd') or (data.get('workspace_roots', [])[0] if data.get('workspace_roots') else ''))" 2>/dev/null)
else
  # Simple grep/sed extraction for cwd
  WORKSPACE_ROOT=$(printf '%s' "$JSON_INPUT" | grep -o '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
  if [ -z "$WORKSPACE_ROOT" ]; then
    WORKSPACE_ROOT=$(printf '%s' "$JSON_INPUT" | grep -o '"workspace_roots"[[:space:]]*:\[[[:space:]]*"[^"]*"' | sed 's/.*"workspace_roots"[[:space:]]*:\[[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
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
TS_SCRIPT="scripts/claude-hooks/agent-check.ts"

# Verify the script exists
if [ ! -f "$TS_SCRIPT" ]; then
  echo "Error: Hook script not found at $TS_SCRIPT" >&2
  exit 1
fi

# Pass the JSON input to the TS script via stdin
echo "$JSON_INPUT" | npx tsx "$TS_SCRIPT"
