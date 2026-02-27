#!/bin/bash
# Panel awareness hook — runs on SessionStart
# Registers the current project panel in {{PANEL_REGISTRY_DIR}}/
# Must be zero-dependency and < 100ms

PANELS_DIR="{{PANEL_REGISTRY_DIR}}"
mkdir -p "$PANELS_DIR"

# Detect project from working directory
# Uses the directory basename — works for any project layout
CWD="$(pwd)"
PROJECT="$(basename "$CWD")"

# Skip if we're in the home directory or root
if [ "$PROJECT" = "$(basename "$HOME")" ] || [ "$PROJECT" = "/" ]; then
  exit 0
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

cat > "$PANELS_DIR/$PROJECT.json" <<EOF
{
  "project": "$PROJECT",
  "startedAt": "$NOW",
  "lastActivity": "$NOW",
  "status": "active",
  "currentTask": "",
  "completedThisSession": [],
  "blockers": []
}
EOF
