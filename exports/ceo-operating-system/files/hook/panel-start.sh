#!/bin/bash
# Panel awareness hook — runs on SessionStart
# Registers the current project panel in ~/.big-heavy-panels/
# Must be zero-dependency and < 100ms

PANELS_DIR="$HOME/.big-heavy-panels"
mkdir -p "$PANELS_DIR"

# Detect project from working directory
CWD="$(pwd)"
PROJECT=""

case "$CWD" in
  */earthly-delights*) PROJECT="earthly-delights" ;;
  */muttered*)         PROJECT="muttered" ;;
  */fictotum*)         PROJECT="fictotum" ;;
  */majordomo*)         PROJECT="majordomo" ;;
  */whizmob*)           PROJECT="whizmob" ;;
  */gallery*)          PROJECT="gallery" ;;
  */accountant*)       PROJECT="accountant" ;;
  */big-heavy)         PROJECT="big-heavy-root" ;;
esac

# Skip if we couldn't detect a project
if [ -z "$PROJECT" ]; then
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
