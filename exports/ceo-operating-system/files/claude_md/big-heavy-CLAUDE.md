# Big Heavy - Organization-Wide Configuration

## Projects

| Project | Description | Domain | Hosting | Tickets |
|---------|-------------|--------|---------|---------|
| `muttered` | Multi-tenant SaaS chatbot platform | mutte.red | Vercel (hobby) | MUT |
| `fictotum` | Historical figures & media works knowledge graph | chronosgraph on Vercel | Vercel (hobby) | FIC |
| `earthly-delights` | Event booking platform (only revenue source) | app.earthlydelights.club | Vercel (hobby) | EARTH |
| `majordomo` | AI-powered household management | hq.bigheavy.fun | Vercel (web) + Railway (Slack bot) | MAJ |
| `whizmob` | Agent inventory & management tool | npm package | Local CLI | BIG |
| `gallery` | Leigh O'Rourke painting portfolio | leighorourkestudio.com | Vercel (hobby) | GAL |
| `accountant` | Big Heavy LLC bookkeeping CLI | — | Local Python CLI | — |
| `homepage` | Big Heavy LLC landing page | bigheavy.fun | Vercel (hobby) | — |

> **Note:** `amazon-order-history-csv-download-mcp` is an MCP server used by majordomo, not a standalone project. `gemini/` contains user-level AI instructions, not a project.

## Infrastructure & Environment

Detailed reference for infrastructure, services, env vars, and workspace setup lives in George's Obsidian vault. All paths below are relative to `~/Documents/brain/`:

| Topic | Vault Path |
|-------|-----------|
| Services registry (AI, DBs, hosting, auth, payments, dev tools) | `context/business/infrastructure.md` |
| Vercel env var hygiene (trailing newline trap) | `context/operations/vercel-env-hygiene.md` |
| direnv setup (.env.shared pattern) | `context/operations/direnv-setup.md` |
| Workspace layout (6-panel grid) | `context/operations/workspace-layout.md` |
| People and relationships | `context/people/` |
| Project strategic context | `context/projects/` |

See `~/Documents/brain/context/_index.md` for the full routing index.

## Research Artifact Policy

When an agent session produces research, analysis, competitive intelligence, or strategic thinking that took more than 5 minutes of reasoning, the output must be persisted as a durable artifact. Sessions are ephemeral. Files are permanent.

### Rules

1. **Save the artifact first.** Before updating CLAUDE.md or writing code, write the full analysis to `docs/research/<topic>-<YYYY-MM-DD>.md`. Include raw findings, not just conclusions.
2. **Reference, don't inline.** CLAUDE.md roadmap items that come from research must cite their source: `(see docs/research/historio-analysis-2026-02-19.md)`. Bullets without context rot.
3. **Create tickets.** Research that identifies work items must produce tickets (in `~/Documents/brain/tickets/`) with acceptance criteria, not just roadmap bullets. Bullets get forgotten. Tickets get done.
4. **Architecture decisions go to `docs/decisions.md`.** If you evaluated tradeoffs and chose an approach, record the decision, the alternatives considered, and why. Date it.
5. **Never let a session end with insights only in the conversation.** If you did competitive research, user interviews, strategic analysis, debugging archaeology, or any deep investigation — the findings must exist in a file before the session ends.

### Competitive Research Template

When analyzing a competitor, save to `docs/research/<competitor>-<date>.md`:

```markdown
# [Competitor] Competitive Analysis — [Date]

## Applicable To
- **Projects**: [e.g., fictotum, majordomo]
- **Products/Features**: [e.g., knowledge graph explorer, proactive check-in loop]
- **Why relevant**: [1 sentence on why this competitor matters to us]

## What They Do
- Product overview, target audience, pricing
- Key features and UX patterns
- Tech stack (if known)

## What They Do Well (steal this)
- Specific features or approaches worth adopting
- Map each to which Big Heavy project benefits

## Where They're Weak (our opportunity)
- Gaps, missing features, bad UX, underserved segments

## What We Should Build
- Actionable items with ticket references (e.g., FIC-XXX, MAJ-XXX)
- Grouped by project

## Community Reception (if available)
- HN/Reddit/Twitter discussion, user reviews, praise and criticism

## Raw Notes & URLs
- Screenshots, links, quotes, data points
```

### What This Applies To
- Competitive research and market analysis
- Architecture decisions and tradeoff evaluations
- User feedback analysis and synthesis
- Strategic discussions that produce action items
- Debugging investigations that reveal systemic issues
- Any conversation where an agent says "based on my analysis" — that analysis must be saved

## Second Brain (Obsidian Vault)

George's Obsidian vault at `~/Documents/brain/` serves as both a capture system and a distributed knowledge base. Synced to phone via Obsidian Sync.

- **Dump**: `dump/` is the capture zone — three persistent containers with ephemeral content:
  - `dump/notes.md` — bullet list, one idea per line
  - `dump/canvas.canvas` — Obsidian Canvas for spatial thinking (screenshots + annotations)
  - `dump/images/` — screenshots and photos referenced by the canvas
- **Context library**: `context/` contains focused reference files that agents load selectively instead of everything in CLAUDE.md. See `~/Documents/brain/context/_index.md` for routing.
- **Discovery**: SessionStart hook (`csuite/hooks/note-discovery.sh`) counts unprocessed dump content. `/standup` surfaces it as Source 9.
- **Processing**: `/dump` triages dump content into tickets, cofounder memory, context files, or acknowledged — then **removes processed content** from the dump containers. If it's still in the dump, it hasn't been processed.
- **Tickets**: `tickets/` contains all project tickets as markdown files. See `## Ticket Conventions` below.
- **People/CRM**: `context/people/` tracks relationships with CRM frontmatter for earthly-delights contacts (audience, stage, revenue, trip).

Agents should read from the vault when they need business context, people info, infrastructure details, or project strategy — instead of expecting it all in CLAUDE.md.

## Ticket Conventions

All project tickets live as markdown files in `~/Documents/brain/tickets/`. This replaces Linear — agents read/write tickets using direct file operations (Glob, Grep, Read, Write).

- **`tickets/`** — active and backlog tickets (the working set)
- **`tickets/done/`** — completed and cancelled tickets (archive)

When a ticket's status changes to `done` or `cancelled`, move it to `tickets/done/`. When looking up a specific ticket by ID, check both locations.

### File Format

```markdown
---
id: BIG-36
title: "Short descriptive title"
status: active
priority: 3
project: whizmob
created: 2026-02-26
updated: 2026-02-26
labels: [bug, scanner]
---

Free-form description and notes. Any markdown.
```

### Frontmatter Fields

| Field | Required | Values |
|-------|----------|--------|
| `id` | yes | `PREFIX-NUMBER` (e.g., `BIG-36`, `MAJ-143`) |
| `title` | yes | Short descriptive title |
| `status` | yes | `backlog`, `active`, `done`, `cancelled` |
| `priority` | yes | `1` (urgent), `2` (high), `3` (normal), `4` (low) |
| `project` | yes | Project slug |
| `created` | yes | `YYYY-MM-DD` |
| `updated` | yes | `YYYY-MM-DD` |
| `labels` | no | Freeform tags |

### Team Prefixes

| Prefix | Project |
|--------|---------|
| BIG | big-heavy / whizmob |
| MUT | muttered |
| FIC | fictotum |
| EARTH | earthly-delights |
| MAJ | majordomo |
| GAL | gallery |

### Creating a Ticket

1. Glob `~/Documents/brain/tickets/PREFIX-*.md` AND `~/Documents/brain/tickets/done/PREFIX-*.md` to find the highest existing number
2. Increment by 1 for the new ticket ID
3. Write the new file to `~/Documents/brain/tickets/` (always the active directory)

### Querying Tickets

```bash
# All active tickets for a project
Grep 'status: active' ~/Documents/brain/tickets/PREFIX-*.md

# All tickets by priority
Grep 'priority: 1' ~/Documents/brain/tickets/*.md

# Stale tickets (check updated date)
Glob ~/Documents/brain/tickets/*.md  # then parse frontmatter
```

### Legacy Linear Archive

`LINEAR_API_KEY` remains in `.env.shared` for read-only access to historical Linear data. All 487 issues were migrated on 2026-02-26. New tickets are created exclusively in Obsidian.

## Executive Operating Model

George operates in "executive mode" from the big-heavy root:

- **`cofounder` skill**: Strategic thinking partner — never writes code, thinks at the business level, challenges direction, identifies cross-project synergies. Persistent memory at `~/.claude/cofounder/memory.json` (v2 schema).
- **`chief-of-staff` agent**: Portfolio briefings, delegation plans, roadmap awareness — reads all project CLAUDE.md files, panel status, cofounder memory, tickets, and active roadmaps.
- Each project has a **standardized CLAUDE.md** with `## Current State` and `## Roadmap` sections that agents read to orient
- Agents update `## Current State` at the end of significant work sessions — CLAUDE.md IS the state, git history IS the log
- E2E tests and strategic tooling live in `csuite/`

### Try It Yourself First

Before asking George to do something manually (create a token, click a dashboard button, copy a value), check whether it can be done via CLI, API, or automation. The answer is usually yes. Examples:
- Sentry → use the Sentry API with auth tokens in `.env.shared`
- Vercel env vars → `vercel env add/rm` via CLI
- Stripe settings → check if there's a Stripe CLI or API equivalent
- Tickets → read/write markdown files in `~/Documents/brain/tickets/`
- Google Workspace → GAM CLI

Only escalate to George for things that genuinely require browser-based auth, manual approval, or UI-only settings (e.g., creating new API tokens with specific scopes, OAuth consent screens).

## Delegation Patterns

### Plan-First Autonomous Execution

The most effective way to delegate implementation to a panel session. Produces clean first-pass results consistently.

**Pattern**: Write (or approve) a complete plan, then paste it with the prefix "Implement the following plan:".

**What the plan must include**:
- Exact file paths to create or modify
- Design decisions already made (not options to choose from)
- Conventions to follow (reference project CLAUDE.md sections)
- Verification steps (how to confirm it worked)

**Example**:
```
Implement the following plan:

## What to build
A single file: `~/.claude/skills/sprint/SKILL.md`

## Design
[Full spec with behavior, conventions, anti-patterns...]

## Verification
1. cd into a project with a roadmap
2. Run /sprint
3. Confirm it finds the roadmap and begins working
```

**Why it works**: Zero clarifying questions needed. The model executes for 10-30 minutes autonomously. The plan IS the acceptance criteria — deviations are visible by diffing against it.

**When NOT to use**: Trivial changes (just describe them), exploratory work (use `/explore`), or when you want the model to make design decisions (use `/create-plan`).

### Sprint Delegation (Roadmap-Driven)

For ongoing project work, use `/sprint` in a panel session. It reads the project's active roadmap and works through milestones autonomously — no plan document needed because the roadmap IS the plan.

```
# Panel 1 — fictotum
cd ~/Documents/big-heavy/fictotum && claude
# then: /sprint
```

### Post-Sprint Quality Cycle

After `/sprint` completes a roadmap, run this cycle before pushing:

```
/sprint                → autonomous roadmap execution
/review                → code review of all changes
"fix the HIGH issues"  → address critical findings
git push               → ship it
```

**Why it works**: `/sprint` optimizes for speed and coverage. `/review` catches security issues, dead code, and overly broad patterns that slip through. Fixing only HIGH+ keeps the cycle fast — MEDIUM/LOW go to the backlog.

**When to extend**: If `/review` surfaces issues worth tracking, create tickets in the same session rather than carrying them as debrief action items (3-debrief rule: if an item survives 3 debriefs, it becomes a ticket immediately).

## Daily Operations

### Standup (`/standup`)

Run `/standup` from the root session to get a 3-minute automated briefing. Works anytime — start of a work session, after a break, or when switching context. It silently collects data from 10 sources:
1. All project CLAUDE.md `## Current State` sections
2. `git log --oneline --since="yesterday"` per project
3. `~/.big-heavy-panels/*.json` for active/ended panels
4. `~/.claude/cofounder/memory.json` (priorities, follow-ups, people)
5. Obsidian tickets (`~/Documents/brain/tickets/`) for open/active/stale issues across all teams
6. Active roadmaps in `<project>/docs/roadmaps/`
7. earthly-delights `cofounder-state.ts` for live deposit/agreement data
8. Uncommitted work (dirty working trees) across all projects
9. Unprocessed dump content (`~/Documents/brain/dump/` — notes.md, canvas, images)
10. Yesterday's daily briefing feedback (`[Y]`/`[N]`/`[L]`/`[]` markers)

Output includes: portfolio pulse, ticket tracker, roadmap progress, overdue follow-ups, yesterday's feedback, unprocessed notes, recommended focus, and autonomous panel prompts ready to paste into project panels.

### Daily Briefing (`/generate-briefing`)

A persistent, reviewable daily briefing written to `~/Documents/brain/daily-briefing/YYYY-MM-DD.md`. Syncs to George's phone via Obsidian Sync. Complements `/standup` — the briefing is a durable artifact you review on your phone; standup is a live interactive session.

**Generation**: Runs automatically on first login via launchd (`csuite/launchd/com.bigheavy.morning-briefing.plist` → `csuite/scripts/morning-briefing.sh`). Guard clause skips if today's briefing already exists. Can also be invoked manually with `/generate-briefing`.

**Content**: Same 9 portfolio sources as standup, plus industry intel (Lenny's Newsletter, How I AI, Simon Willison's Weblog, HN-as-meta-source filtered for Big Heavy relevance).

**Feedback loop**: Priority Decisions section uses `[]` bracket markers:
- `[Y]` — Yes, work on this today
- `[N]` — No, remove from the list entirely
- `[L]` — Later, keep on list but not today
- `[]` — Not yet reviewed (carry forward)

George fills these in on his phone. The next standup (Source 10) and next briefing (Source 11) parse yesterday's markers and act on them — `[Y]` items get prioritized, `[N]` items get flagged for ticket cleanup, `[]` items stale for 3+ days get flagged.

**Installation** (one-time):
```bash
# Load the launchd agent
launchctl load ~/Documents/big-heavy/csuite/launchd/com.bigheavy.morning-briefing.plist
```

### Panel Awareness System

Hook scripts automatically register/deregister panels:
- **SessionStart** → `csuite/hooks/panel-start.sh` writes `~/.big-heavy-panels/<project>.json`
- **Stop** → `csuite/hooks/panel-stop.sh` sets `status: "ended"`

Panel JSON format:
```json
{
  "project": "earthly-delights",
  "startedAt": "ISO timestamp",
  "lastActivity": "ISO timestamp",
  "status": "active" | "ended",
  "currentTask": "",
  "completedThisSession": [],
  "blockers": []
}
```

The root session (standup, chief-of-staff) reads these files to know which panels are active.

### Roadmap Process (`/roadmap <project>`)

Run `/roadmap <project>` for a structured planning session that:
1. Reads project CLAUDE.md, cofounder memory, tickets, and previous roadmap
2. Presents cofounder (business), product (user), and CTO (technical) perspectives
3. Proposes 3-5 outcome-based milestones (shipped features, not tasks)
4. George refines through conversation
5. Output saved to `<project>/docs/roadmaps/<name>.md` — **named by content** (e.g., `portraits-and-fiction.md`), never by date or month

Roadmaps have no calendar cadence. They're replaced when their milestones are done or obsolete, not when a month ends. A roadmap might last 2 days or 2 months. Never title a roadmap `2026-04.md` or `march.md` — that implies monthly cadence and creates pressure to replace it when the calendar flips rather than when the work is done.

### Session Close Protocol

**`/close` — required for all panel sessions (workspace hygiene):**
1. Validates CLAUDE.md `## Current State` is updated with today's date
2. Checks for uncommitted changes and stages + commits them
3. Outputs a pass/fail checklist confirming the session is clean
4. If blocked, document the blocker under Known Issues before committing

**`/debrief` → `/close` — for significant panel sessions (capture insights, then clean up):**
Run `/debrief` first when the session produced insights worth preserving — new architectural patterns, major features shipped, workflow improvements discovered. Then run `/close` to finalize. Most routine sessions (bug fix, small sprint) only need `/close`.

**`/debrief` — for root sessions before wrapping up:**
1. Captures prompt coaching, discovered unlocks, and SOP candidates
2. Output saved to `docs/debriefs/YYYY-MM-DD.md`
3. Updates cofounder memory if strategic decisions were made
4. Commit changes

If `/close` is skipped (session ends abruptly), the enhanced `panel-stop.sh` hook captures git state in the panel JSON. `/standup` will flag orphaned uncommitted work. See `docs/research/session-close-protocol-2026-02-25.md` for the full analysis.

### Cofounder Memory (v2)

Persistent state at `csuite/cofounder/memory.json` (symlinked from `~/.claude/cofounder/memory.json`). Key fields:
- Per-project: `decisions`, `followUps`, `notes`, `lastSessionDate`, `lastSessionSummary`, `whatNext`, `blockers`, `activeRoadmap`
- Cross-project: `priorities`, `strategicDecisions[]` (with `affectsProjects`), `dependencies[]`
- People: `people.<slug>` with `relationship`, `lastContact`, `context`, `nextAction`, `projects[]`

### Autonomous Panel Prompt Format

Panel prompts (generated by `/standup` and `chief-of-staff`) follow this structure:
- **Context**: yesterday's commits, CLAUDE.md state, cofounder notes, roadmap milestone, tickets
- **Task**: specific thing to build/fix, tied to a roadmap milestone
- **Acceptance criteria**: testable checklist
- **Patterns to follow**: reference specific project files/conventions
- **Files to modify**: concrete paths
- **Do NOT**: explicit guardrails
- **When done**: run `/close` (validates CLAUDE.md update, commits changes, outputs checklist)

See `csuite/templates/panel-prompt.md` for the canonical template.

### Debrief Accumulation

Session debriefs accumulate in `docs/debriefs/`. After 3-5 debriefs, review for recurring patterns:
- Same SOP candidate in 2+ debriefs → extract to CLAUDE.md
- Same prompt coaching pattern in 2+ debriefs → update instructions
- Same unlock re-discovered → document more prominently

### Creating a New Skill

Skills auto-register by directory convention. No manual config or restart needed.

1. Read 2-3 existing skills in `~/.claude/skills/` for convention reference (frontmatter, Boot Sequence, Behavior Notes, Anti-Patterns sections)
2. Create `~/.claude/skills/<name>/SKILL.md` with `name` and `description` in YAML frontmatter
3. Verify it appears in the skill list (invoke `/` and check)
4. **Core workflow skills** (standup, roadmap, sprint, debrief, cofounder, leadership-meeting) should also be documented in `## Daily Operations` above
5. Utility skills (explore, execute, review, etc.) need no additional documentation

### Separate Git Repos

Not all projects are subdirectories of the big-heavy monorepo. Some are separate git repos that happen to live under `~/Documents/big-heavy/`:

- **Separate repos**: `majordomo`, `gallery`
- **Monorepo subdirectories**: `muttered`, `fictotum`, `earthly-delights`, `ronin`, `accountant`

When running git commands across projects (e.g., in `/standup`), always `cd` into the project directory or use `git -C <project-dir>`. Do NOT use `git log -- <subdir>/` from the monorepo root for separate repos — it returns nothing.
