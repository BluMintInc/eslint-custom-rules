#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load nvm when available so the configured Node version is active.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
fi

cd "$REPO_ROOT"

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Run ./.cursor/install.sh first." >&2
  exit 1
fi

echo "Workspace ready. Common commands:"
echo "  npm test            # run Jest once"
echo "  npm test -- --watch # run Jest in watch mode"
echo "  npm run lint:js     # lint rule sources"
echo "  npm run docs        # regenerate rule documentation"

