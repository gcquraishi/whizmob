#!/bin/bash
# Panel awareness hook — runs on Stop
# Updates panel status to "ended" and captures git state
# Must be zero-dependency and < 200ms
#
# Git state capture enables standup Source 8 (uncommitted work detection).
# If a session ends without committing, standup will flag the orphaned changes.

PANELS_DIR="{{PANEL_REGISTRY_DIR}}"

# Detect project from working directory
CWD="$(pwd)"
PROJECT="$(basename "$CWD")"

# Skip if we're in the home directory or root
if [ "$PROJECT" = "$(basename "$HOME")" ] || [ "$PROJECT" = "/" ]; then
  exit 0
fi

PANEL_FILE="$PANELS_DIR/$PROJECT.json"

if [ ! -f "$PANEL_FILE" ]; then
  exit 0
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# Get repo root (works for both monorepo subdirs and separate repos)
REPO_ROOT="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")"

# Capture git state (fast — just counts and a few lines of stat)
UNCOMMITTED=$(git -C "$REPO_ROOT" status --short 2>/dev/null | wc -l | tr -d ' ')
MODIFIED=$(git -C "$REPO_ROOT" diff --name-only 2>/dev/null | wc -l | tr -d ' ')
UNTRACKED=$(git -C "$REPO_ROOT" ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
DIFF_STAT=$(git -C "$REPO_ROOT" diff --stat 2>/dev/null | tail -1)

# Use python3 (available on macOS) for reliable JSON update
python3 << PYTHON_EOF
import json

panel_file = "$PANEL_FILE"
uncommitted = int("$UNCOMMITTED" or "0")
modified = int("$MODIFIED" or "0")
untracked = int("$UNTRACKED" or "0")
diff_stat = """$DIFF_STAT""".strip()
now = "$NOW"

try:
    with open(panel_file, 'r') as f:
        data = json.load(f)
except Exception:
    data = {}

data['status'] = 'ended'
data['lastActivity'] = now

# Capture git state so standup can detect orphaned work
if uncommitted > 0:
    data['gitState'] = {
        'uncommittedCount': uncommitted,
        'modifiedCount': modified,
        'untrackedCount': untracked,
        'diffSummary': diff_stat
    }
elif 'gitState' in data:
    # Clean session — remove any stale gitState from previous runs
    del data['gitState']

with open(panel_file, 'w') as f:
    json.dump(data, f, indent=2)
PYTHON_EOF

# Fallback: if python3 fails, just overwrite with ended status
if [ $? -ne 0 ]; then
  STARTED_AT=$(grep -o '"startedAt": "[^"]*"' "$PANEL_FILE" | cut -d'"' -f4)
  cat > "$PANEL_FILE" <<EOF
{
  "project": "$PROJECT",
  "startedAt": "${STARTED_AT:-$NOW}",
  "lastActivity": "$NOW",
  "status": "ended",
  "currentTask": "",
  "completedThisSession": [],
  "blockers": []
}
EOF
fi
