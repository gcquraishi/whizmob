---
name: standup
description: "Portfolio standup briefing. Silently collects data from 10 sources (CLAUDE.md files, git logs, panel status, cofounder memory, Obsidian tickets, active roadmaps, live state, uncommitted work, Obsidian vault, yesterday's briefing feedback), then outputs a tight portfolio briefing with autonomous panel prompts."
---

# /standup — Portfolio Standup Briefing

You are producing {{OWNER_NAME}}'s standup briefing across the {{ORG_NAME}} portfolio. This replaces 15 minutes of context-rebuilding with a 3-minute automated briefing. Can be run anytime — start of a work session, after a break, or when switching context.

## Boot Sequence (Silent)

Run all of these silently. Do NOT narrate the data collection — just present the final briefing.

### Source 1: Project CLAUDE.md Files

Discover projects by scanning for CLAUDE.md files under the workspace root:
```bash
find {{WORKSPACE_ROOT}} -maxdepth 2 -name CLAUDE.md -not -path '*/node_modules/*' 2>/dev/null
```

Read the `## Current State` section from each discovered project CLAUDE.md.

### Source 2: Recent Git Activity

For each project directory discovered above, run:
```bash
git -C <project-dir> log --oneline --since="yesterday" 2>/dev/null
```

**CRITICAL**: Always use `git -C <project-dir>` for every project. Some projects may be independent git repos (they have their own `.git`), while others may be monorepo subdirectories. `git -C` works correctly for both. Do NOT run `git log -- <subdir>/` from a parent directory — it returns nothing for separate repos.

### Source 3: Panel Status

Read all files in `{{PANEL_REGISTRY_DIR}}/*.json`. These show which project panels are active/ended and when they last had activity.

### Source 4: Cofounder Memory

Read `{{WORKSPACE_ROOT}}/csuite/cofounder/memory.json` (primary) or `~/.claude/cofounder/memory.json` (fallback symlink). Extract:
- Cross-project priorities
- Overdue follow-ups (any followUp where `dueDate` < today and `status` = "pending")
- Per-project decisions and notes
- People with pending actions

### Source 5: Obsidian Tickets

Read tickets from George's Obsidian vault at `{{VAULT_PATH}}/tickets/`.

1. **Discover ticket files**: Use Glob to find all `{{VAULT_PATH}}/tickets/*.md` files.

2. **Parse YAML frontmatter** from each file. Expected frontmatter fields:
   ```yaml
   ---
   title: "Short descriptive title"
   id: PREFIX-NNN
   status: active     # backlog | active | done | cancelled
   priority: 2        # 1=urgent, 2=high, 3=normal, 4=low
   project: project-name
   updated: 2026-02-20
   ---
   ```

3. **Filter**: Only show tickets with `status: backlog` or `status: active`. Skip `done` and `cancelled`.

4. **Categorize by project** (from frontmatter `project` field, or derive from filename prefix). The ticket identifier is the filename without `.md` extension (e.g., `PROJ-19.md` → `PROJ-19`).

5. **Stale detection**: Flag any ticket as "stale" if `status: active` and the `updated` date is older than 7 days from today.

6. **Priority mapping**: Display priorities as labels — 1=Urgent, 2=High, 3=Normal, 4=Low.

### Source 6: Active Roadmaps

For each project, check `<project>/docs/roadmaps/` for active roadmap files. Parse milestone statuses if found.

### Source 7: Live State Collectors

For any project that has a state collector script (`scripts/cofounder-state.ts` or `web-app/scripts/cofounder-state.ts`), run it:
```bash
cd <project-dir> && npx tsx scripts/cofounder-state.ts 2>/dev/null || npx tsx web-app/scripts/cofounder-state.ts 2>/dev/null
```
Parse the JSON output for live business data (revenue, payments, etc.).

### Source 8: Uncommitted Work (Dirty Working Trees)

**CRITICAL**: This catches work that was done but never committed — the #1 cause of context leaking between sessions.

For each project directory:
```bash
git -C <project-dir> diff --stat 2>/dev/null
git -C <project-dir> status --short 2>/dev/null
```

If ANY project has uncommitted changes (modified or untracked files), surface them prominently in the briefing under a dedicated **Uncommitted Work** section between Portfolio Pulse and Ticket Tracker. Format:

```
## Uncommitted Work (Session Close Failures)
| Project | Modified | Untracked | Key Files |
|---------|----------|-----------|-----------|
```

This section should use a warning tone — uncommitted work means a session ended without following the close protocol, and context is at risk of being lost.

### Source 9: Unprocessed Dump Content

Scan the Obsidian vault dump folder at `{{VAULT_PATH}}/dump/`:

1. **`dump/notes.md`** — count non-empty bullet lines (`-` or `*` prefixed)
2. **`dump/canvas.canvas`** — parse JSON, count non-empty nodes (skip nodes where `text` is `""`)
3. **`dump/images/`** — count image files
4. **`daily/`** — today's and yesterday's daily notes (check for `processed: false` or missing `processed` field)

If the dump has content, report it in the briefing. If everything is empty, omit this section entirely.

### Source 10: Yesterday's Briefing Feedback

Check if yesterday's daily briefing exists and has feedback:

```bash
cat {{VAULT_PATH}}/daily-briefing/$(date -v-1d +%Y-%m-%d).md 2>/dev/null
```

If the file exists, parse the **Priority Decisions** section for `[Y]`, `[N]`, `[L]`, or `[]` markers:

- **`[Y]` items**: {{OWNER_NAME}} wants to work on these today. Prioritize them in Recommended Focus and Panel Prompts. Check `git log --since="yesterday"` for evidence of progress.
- **`[N]` items**: {{OWNER_NAME}} wants these removed. Flag for ticket cancellation or cofounder memory cleanup. Do NOT include in today's recommendations.
- **`[L]` items**: Keep on the list but not today. Carry forward to the next briefing but deprioritize.
- **`[]` items (unreviewed)**: Carry forward. If an item has been `[]` for 3+ consecutive days, flag it: "Unreviewed for N days — still relevant?"

Incorporate this feedback into the standup output — `[Y]` items should appear first in Recommended Focus, `[N]` items should be called out for removal, and unreviewed items should be flagged if stale.

### Briefing Awareness

If today's daily briefing already exists at `{{VAULT_PATH}}/daily-briefing/$(date +%Y-%m-%d).md`, note it at the top of the standup:

> **Daily briefing generated today.** Review it in Obsidian or regenerate with `/generate-briefing`.

The standup still runs its full analysis — the briefing is a persistent artifact while the standup is a live interactive briefing. They complement each other.

---

## Output Format

After collecting all data, output this briefing:

```
# Standup — [DATE]

## The One Thing
[Single opinionated sentence — the most important thing today. Be specific. Use names, numbers, deadlines.]

## Portfolio Pulse
| Project | Status | Yesterday | Today | Blockers |
|---------|--------|-----------|-------|----------|
[One row per active project. Status = emoji + word. Skip projects with no git activity in 7+ days unless they have open blockers.]

## Uncommitted Work (Session Close Failures)
[ONLY if any project has uncommitted changes. Show modified/untracked files. Flag this prominently — it means a session ended without following the close protocol. Recommend George commit or discard before starting new work.]

## Ticket Tracker
| Team | Backlog | Active | Stale (>7d) | Urgent/High |
|------|---------|--------|-------------|-------------|
[One row per team with tickets. Flag specific stale tickets by identifier. Highlight priority 1-2 tickets.]

## Roadmap Progress
[For each project with an active roadmap, show milestone progress as checkboxes]

## Overdue Follow-Ups
[From cofounder memory — name the person, the action, how overdue it is]

## Unprocessed Dump
[ONLY if dump has content. Show: N bullets in notes.md, N nodes in canvas, N images. Prompt {{OWNER_NAME}} to run /dump. Omit section entirely if dump is empty.]

## Yesterday's Briefing Feedback
[ONLY if yesterday's briefing had responses. Show what happened with Y/N/L items.]
- Y items: [list — check git log for evidence of progress]
- N items: [list — flag for ticket cancellation/memory cleanup]
- Carried forward: [items that were [] or [L] yesterday]
- Stale: [items unreviewed for 3+ days]

## Recommended Focus Today
[2-3 projects with 1-sentence reasoning each. "Skip X today" is valid. Revenue-generating projects get priority when money is at risk. [Y] items from yesterday's briefing should appear first.]

## Panel Prompts
[For each recommended project, a complete autonomous prompt using the format below]
```

---

## Autonomous Panel Prompt Format

Each panel prompt must be self-contained — paste it into a fresh Claude Code session and get 30+ minutes of autonomous work.

```
---
PROJECT: [name]
CONTEXT:
- Yesterday's commits: [list from git log]
- Current state: [from CLAUDE.md]
- Cofounder notes: [relevant items from memory.json]
- Active roadmap milestone: [if applicable]
- Relevant tickets: [identifiers and titles]

TASK: [Specific thing to build/fix, tied to a roadmap milestone if one exists]

ACCEPTANCE CRITERIA:
- [ ] [Testable criterion]
- [ ] [Testable criterion]
- [ ] [Testable criterion]

PATTERNS TO FOLLOW:
- [Reference specific project files/conventions, e.g., "Follow the pattern in src/components/ExistingComponent.tsx"]

FILES TO MODIFY:
- [Concrete paths]

DO NOT:
- Do not refactor unrelated code
- Do not add features beyond the acceptance criteria
- Do not change the database schema without explicit approval

WHEN DONE:
1. Run /close (validates CLAUDE.md update, commits changes, outputs checklist)
2. If blocked, document the blocker under Known Issues in CLAUDE.md before /close
---
```

---

## Behavior Notes

- **Revenue urgency**: Revenue-generating projects always get called out if payments are unpaid or deadlines are approaching. Money at risk = top priority.
- **Dormant projects**: Skip projects with no recent git activity unless they have open blockers.
- **Be opinionated**: "The One Thing" should be a recommendation, not a question. {{OWNER_NAME}} is the CEO — tell them what matters most.
- **Panel prompts must be specific**: Reference actual file paths, actual ticket numbers, actual git commits. Vague prompts waste {{OWNER_NAME}}'s time.
- **Stale ticket detection**: Any ticket with `status: active` and `updated` date older than 7 days gets flagged. Priority 1-2 stale tickets get extra attention.
