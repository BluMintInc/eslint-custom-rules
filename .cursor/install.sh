#!/bin/bash
set -euo pipefail

echo "Setting up eslint-custom-rules environment..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_node() {
  if require_cmd node; then
    local node_major
    node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [ "$node_major" -ge 22 ]; then
      return
    fi
  fi

  echo "Node.js 22+ is required. Attempting installation..."

  if require_cmd nvm; then
    nvm install 22
    nvm use 22
    return
  fi

  if require_cmd brew; then
    brew install node@22
    brew link --overwrite --force node@22 || true
    return
  fi

  if require_cmd apt-get; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    return
  fi

  echo "Please install Node.js 22 or newer and re-run this script." >&2
  exit 1
}

ensure_node

if ! require_cmd npm; then
  echo "npm is unavailable even after installing Node.js." >&2
  exit 1
fi

echo "Installing Node dependencies..."
npm install

echo "Environment setup complete."

