---
name: standup
description: "Portfolio standup briefing. Silently collects data from 8 sources (CLAUDE.md files, git logs, panel status, cofounder memory, Linear API, active roadmaps, live state, uncommitted work), then outputs a tight portfolio briefing with autonomous panel prompts."
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

For projects in separate git repos (not monorepo subdirectories), detect the git root and use it.

### Source 3: Panel Status

Read all files in `{{PANEL_REGISTRY_DIR}}/*.json`. These show which project panels are active/ended and when they last had activity.

### Source 4: Cofounder Memory

Read `{{WORKSPACE_ROOT}}/{{MEMORY_PATH}}` (primary) or `~/.claude/cofounder/memory.json` (fallback symlink). Extract:
- Cross-project priorities
- Overdue follow-ups (any followUp where `dueDate` < today and `status` = "pending")
- Per-project decisions and notes
- People with pending actions

### Source 5: Linear API

If a `LINEAR_API_KEY` is available (check `{{WORKSPACE_ROOT}}/{{ENV_SHARED_PATH}}` or environment), query the Linear API for open/in-progress issues across all teams.

GraphQL query to fetch issues (paginate if `hasNextPage` is true):
```graphql
{
  teams {
    nodes {
      key
      name
      issues(filter: { state: { type: { in: ["started", "unstarted", "backlog"] } } }, first: 50) {
        pageInfo { hasNextPage endCursor }
        nodes {
          identifier
          title
          state { name type }
          assignee { name }
          updatedAt
          priority
        }
      }
    }
  }
}
```

**Pagination**: If any team's `pageInfo.hasNextPage` is `true`, run a follow-up query with `after: "<endCursor>"` on the `issues` field to get the next page. Repeat until `hasNextPage` is `false`.

Categorize by team. Flag issues as "stale" if `updatedAt` is older than 7 days.

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

If ANY project has uncommitted changes (modified or untracked files), surface them prominently in the briefing under a dedicated **Uncommitted Work** section between Portfolio Pulse and Linear Tracker. Format:

```
## Uncommitted Work (Session Close Failures)
| Project | Modified | Untracked | Key Files |
|---------|----------|-----------|-----------|
```

This section should use a warning tone — uncommitted work means a session ended without following the close protocol, and context is at risk of being lost.

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
[ONLY if any project has uncommitted changes. Show modified/untracked files. Flag this prominently — it means a session ended without following the close protocol. Recommend {{OWNER_NAME}} commit or discard before starting new work.]

## Linear Tracker
| Team | Open | In Progress | Blocked | Stale (>7d) |
|------|------|-------------|---------|-------------|
[One row per team with issues. Flag specific stale tickets by identifier.]

## Roadmap Progress
[For each project with an active roadmap, show milestone progress as checkboxes]

## Overdue Follow-Ups
[From cofounder memory — name the person, the action, how overdue it is]

## Recommended Focus Today
[2-3 projects with 1-sentence reasoning each. "Skip X today" is valid. Revenue-generating projects get priority when money is at risk.]

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
- Relevant Linear tickets: [identifiers and titles]

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
- **Linear stale detection**: Any ticket with no update in 7+ days gets flagged. Tickets stuck in "In Progress" for >5 days get extra attention.
