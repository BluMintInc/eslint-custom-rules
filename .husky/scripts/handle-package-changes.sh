#!/bin/bash
set -euo pipefail

if git rev-parse -q --verify HEAD@{1} >/dev/null 2>&1; then
  diff_target="HEAD@{1}"
else
  diff_target=""
fi

if [ -n "$diff_target" ] && git diff --name-only "$diff_target" | grep -qE 'package(-lock)?\.json$'; then
  echo "Detected changes in package.json or package-lock.json. Running npm install..."
  npm install

  echo "Restarting ESLint server..."
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "eslint-server" || true
  elif command -v taskkill >/dev/null 2>&1; then
    taskkill /f /im eslint-server.exe 2>/dev/null || true
  fi

  touch .eslintrc.js 2>/dev/null || true
  echo "ESLint server should restart automatically in your IDE."
fi
