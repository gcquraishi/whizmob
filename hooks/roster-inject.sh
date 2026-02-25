#!/bin/bash
# Whizmob SessionStart hook: injects agent roster into Claude Code context.
# Installed in ~/.claude/settings.json under hooks.SessionStart.
#
# Outputs a compact roster to stdout, which Claude Code adds to context.
# Falls back gracefully if whizmob DB doesn't exist yet.

DB_PATH="$HOME/.whizmob/whizmob.db"

# If no database, skip silently
if [ ! -f "$DB_PATH" ]; then
  exit 0
fi

# Resolve the whizmob CLI to run.
# 1. If whizmob is on PATH (npm global install), use it directly.
# 2. Otherwise, derive the project root from this hook file's location
#    (hooks/ lives one level below the project root) and call dist/index.js.
if command -v whizmob &>/dev/null; then
  whizmob roster --hook 2>/dev/null
else
  HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  WHIZMOB_DIR="$(dirname "$HOOK_DIR")"
  node "$WHIZMOB_DIR/dist/index.js" roster --hook 2>/dev/null
fi
