#!/bin/bash
# Ronin SessionStart hook: injects agent roster into Claude Code context.
# Installed in ~/.claude/settings.json under hooks.SessionStart.
#
# Outputs a compact roster to stdout, which Claude Code adds to context.
# Falls back gracefully if ronin DB doesn't exist yet.

DB_PATH="$HOME/.ronin/ronin.db"

# If no database, skip silently
if [ ! -f "$DB_PATH" ]; then
  exit 0
fi

# Resolve the ronin CLI to run.
# 1. If ronin is on PATH (npm global install), use it directly.
# 2. Otherwise, derive the project root from this hook file's location
#    (hooks/ lives one level below the project root) and call dist/index.js.
if command -v ronin &>/dev/null; then
  ronin roster --hook 2>/dev/null
else
  HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  RONIN_DIR="$(dirname "$HOOK_DIR")"
  node "$RONIN_DIR/dist/index.js" roster --hook 2>/dev/null
fi
