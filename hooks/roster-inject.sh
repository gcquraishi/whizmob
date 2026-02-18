#!/bin/bash
# Ronin SessionStart hook: injects agent roster into Claude Code context.
# Installed in ~/.claude/settings.json under hooks.SessionStart.
#
# Outputs a compact roster to stdout, which Claude Code adds to context.
# Falls back gracefully if ronin DB doesn't exist yet.

RONIN_DIR="$HOME/Documents/big-heavy/ronin"
DB_PATH="$HOME/.ronin/ronin.db"

# If no database, skip silently
if [ ! -f "$DB_PATH" ]; then
  exit 0
fi

# Run the roster command; suppress stderr so hook errors don't break Claude
node "$RONIN_DIR/dist/index.js" roster --hook 2>/dev/null
