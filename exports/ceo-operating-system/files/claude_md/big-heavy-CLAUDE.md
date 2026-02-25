# Big Heavy - Organization-Wide Configuration

## Projects

| Project | Description | Domain | Hosting | Linear |
|---------|-------------|--------|---------|--------|
| `muttered` | Multi-tenant SaaS chatbot platform | mutte.red | Vercel (hobby) | MUT |
| `fictotum` | Historical figures & media works knowledge graph | chronosgraph on Vercel | Vercel (hobby) | CHR |
| `earthly-delights` | Event booking platform (only revenue source) | app.earthlydelights.club | Vercel (hobby) | — |
| `quraishi-hq` | AI-powered household management | hq.bigheavy.fun | Vercel (web) + Railway (Slack bot) | QHQ |
| `whizmob` | Agent inventory & management tool | npm package | Local CLI | — |
| `gallery` | Leigh O'Rourke painting portfolio | leighorourkestudio.com | Vercel (hobby) | — |
| `accountant` | Big Heavy LLC bookkeeping CLI | — | Local Python CLI | — |

> **Note:** `amazon-order-history-csv-download-mcp` is an MCP server used by quraishi-hq, not a standalone project. `gemini/` contains user-level AI instructions, not a project.

## Infrastructure Registry

Central inventory of every external service and account across Big Heavy projects. No secrets here — just a map of what exists where. Credentials live in each project's `.env.local`.

### AI / LLM Services

| Service | Dashboard | Projects | Env Var | Notes |
|---------|-----------|----------|---------|-------|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) | muttered, earthly-delights, quraishi-hq | `ANTHROPIC_API_KEY` | Separate key per project for usage tracking |
| OpenAI | [platform.openai.com](https://platform.openai.com) | muttered, quraishi-hq | `OPENAI_API_KEY` | Embeddings only (text-embedding-3-small, ~$0.02/1M tokens) |
| Google Gemini | [ai.google.dev](https://ai.google.dev) | fictotum | `GEMINI_API_KEY` | Research and data enrichment |

### Databases

| Service | Dashboard | Projects | Env Vars | Notes |
|---------|-----------|----------|----------|-------|
| Neon Postgres | [console.neon.tech](https://console.neon.tech) | muttered | `DATABASE_URL`, `POSTGRES_URL`, `PG*` | ep-crimson-heart (us-east-1), project: broad-darkness-86514292, db: muttered |
| Neon Postgres | [console.neon.tech](https://console.neon.tech) | earthly-delights | `DATABASE_URL`, `POSTGRES_URL`, `PG*` | ep-shiny-resonance (us-east-1), project: raspy-cherry-97071395, db: earthly_delights |
| Neon Postgres | [console.neon.tech](https://console.neon.tech) | quraishi-hq | `DATABASE_URL`, `DATABASE_URL_DIRECT` | ep-wispy-heart (us-east-2, Washington DC) |
| Neo4j Aura | [console.neo4j.io](https://console.neo4j.io) | fictotum | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Database ID: c78564a4 |
| Pinecone | [app.pinecone.io](https://app.pinecone.io) | muttered | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` | Index: school-chatbot (1536 dims, cosine) |
| Upstash Redis | [console.upstash.com](https://console.upstash.com) | muttered | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Serverless rate limiting (free tier) |

### Hosting & Deployment

| Service | Dashboard | Projects | Env Vars | Notes |
|---------|-----------|----------|----------|-------|
| Vercel | [vercel.com](https://vercel.com) | muttered, fictotum, earthly-delights, quraishi-hq, gallery | `VERCEL_OIDC_TOKEN` (auto-generated) | Single team: georges-projects-e1ff053a, all hobby plan |
| Railway | [railway.app](https://railway.app) | quraishi-hq | — | Slack bot hosting only |

### Vercel Env Var Hygiene

Trailing newlines in Vercel env vars cause silent, hard-to-diagnose failures (broken OAuth, broken Sentry uploads). This has bitten us multiple times.

**When setting env vars via CLI:**
```bash
# CORRECT — printf doesn't add a trailing newline
printf '%s' 'my-secret-value' | npx vercel env add VAR_NAME production

# WRONG — echo adds \n, which becomes part of the value
echo 'my-secret-value' | npx vercel env add VAR_NAME production
```

**When setting env vars via Vercel dashboard:**
- Paste values carefully — some terminals/editors add invisible newlines on copy
- After saving, verify with `npx vercel env pull` and inspect the value

**After setting or changing any env var:**
```bash
npx vercel env pull .env.check --environment production
grep VAR_NAME .env.check    # visually inspect the value
rm .env.check
```

**To update an existing var** (since `vercel env update` has broken stdin handling):
```bash
printf 'y\n' | npx vercel env rm VAR_NAME production
printf '%s' 'new-value' | npx vercel env add VAR_NAME production
```

### Developer Tools

| Service | Dashboard | Projects | Env Var | Notes |
|---------|-----------|----------|---------|-------|
| Linear | [linear.app/bigheavy](https://linear.app/bigheavy) | muttered, fictotum, quraishi-hq | `LINEAR_API_KEY` | Shared workspace, teams: MUT (muttered), FIC (fictotum), QHQ (quraishi-hq), EARTH (earthly-delights), BIG (big-heavy). User-level API key in `.env.shared`. |
| Firecrawl | [firecrawl.dev](https://firecrawl.dev) | muttered | `FIRECRAWL_API_KEY` | Free tier (500 credits). REST API only. Docs: docs.firecrawl.dev |
| Sentry | [big-heavy.sentry.io](https://big-heavy.sentry.io) | muttered, fictotum, earthly-delights, quraishi-hq, gallery | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Developer plan (free, 5K errors/month). Separate project per app. Auth token + org in .env.shared. |

### Auth & Identity

| Service | Dashboard | Projects | Env Vars | Notes |
|---------|-----------|----------|----------|-------|
| Google Cloud (OAuth) | [console.cloud.google.com](https://console.cloud.google.com) | muttered, earthly-delights, quraishi-hq | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Separate GCP project per app |
| Google Cloud (Service Acct) | [console.cloud.google.com](https://console.cloud.google.com) | earthly-delights | `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | For programmatic Google Docs access |
| NextAuth.js | — (open source) | muttered, earthly-delights, quraishi-hq | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Unique secret per project |

### Payments & Email

| Service | Dashboard | Projects | Env Vars | Notes |
|---------|-----------|----------|----------|-------|
| Stripe | [dashboard.stripe.com](https://dashboard.stripe.com) | earthly-delights | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` | Live keys (sk_live_*). 5 price IDs configured. |
| Gmail SMTP | — | muttered | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | george@bigheavy.fun, port 587 |
| Slack API | [api.slack.com](https://api.slack.com) | quraishi-hq | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET` | thequraishis.slack.com (free plan). Socket Mode, Bolt.js. |

## direnv Setup

Shared keys live in `.env.shared` at the repo root, loaded automatically via `direnv` when you `cd` into any project.

### How it works
- **`.env.shared`** (root) — Keys for shared single-account services (Firecrawl, Neo4j, OpenAI, Gemini, Sentry org-level, Linear)
- **`<project>/.envrc`** — Loads `.env.shared` first, then project-specific `.env.local`
- **`<project>/.env.local`** — Everything else (Anthropic, databases, auth, payments)
- Project `.env.local` values override `.env.shared` if there's a conflict

### Keys in `.env.shared`
| Key | Service | Why shared |
|-----|---------|-----------|
| `OPENAI_API_KEY` | OpenAI | Single account, not yet used in multiple projects |
| `GEMINI_API_KEY` | Google Gemini | Single account |
| `FIRECRAWL_API_KEY` | Firecrawl | Single shared account (documented in free tier) |
| `NEO4J_URI/USERNAME/PASSWORD` | Neo4j Aura | Single graph database |
| `SENTRY_ORG` | Sentry | Single org (`big-heavy`) across all projects |
| `SENTRY_AUTH_TOKEN` | Sentry | Org-level auth token for source map uploads |
| `LINEAR_API_KEY` | Linear | User-level API key, all teams accessible |

### Adding a new project
1. Create `<project>/.envrc`:
   ```
   dotenv ../.env.shared
   dotenv_if_exists .env.local
   ```
2. Run `direnv allow <project>/`
3. Add project-specific keys to `<project>/.env.local`

### Note on `NEXT_PUBLIC_*` vars
`direnv` sets shell env vars, which Next.js server-side code reads fine. But `NEXT_PUBLIC_*` variables must be in the project's `.env.local` because they get inlined at build time.

## Workspace Layout

George uses a **6-panel Cursor terminal grid** (3 columns x 2 rows) for concurrent project work. Each panel is a Cursor terminal window sized to one-sixth of the screen using Raycast window management.

```
┌──────────────┬──────────────┬──────────────┐
│   Panel 1    │   Panel 2    │   Panel 3    │
│  (project)   │  (project)   │  (project)   │
├──────────────┼──────────────┼──────────────┤
│   Panel 4    │   Panel 5    │   Panel 6    │
│  (project)   │  (project)   │  (project)   │
└──────────────┴──────────────┴──────────────┘
```

### How it works
- Each panel runs a **separate Cursor terminal** with Claude Code (`claude`) active in a project directory
- Raycast's "First Sixth", "Second Sixth", etc. commands position each window
- The **big-heavy root** session (this one) runs in a separate full-size terminal and acts as the executive command center
- All 6 project panels + the root session can run simultaneously

### Quick start
```bash
./workspace                    # Opens all default projects in the 3x2 grid
```
Edit the `PROJECTS` array in `./workspace` to change which projects open and in what order (top-left to bottom-right, max 6).

### Agent instructions for workspace delegation
When the `chief-of-staff` or `cofounder` agent recommends work across projects, format delegation as **terminal commands the user can paste** into each panel:

```
# Panel 1 — muttered
cd ~/Documents/big-heavy/muttered && claude

# Panel 2 — earthly-delights
cd ~/Documents/big-heavy/earthly-delights && claude
```

- Always specify which panel/project gets which task
- Keep instructions self-contained per panel — each Claude Code session is independent
- If a task spans projects, note the dependency and sequencing across panels
- The user can have up to 6 concurrent project sessions plus the root executive session

## Research Artifact Policy

When an agent session produces research, analysis, competitive intelligence, or strategic thinking that took more than 5 minutes of reasoning, the output must be persisted as a durable artifact. Sessions are ephemeral. Files are permanent.

### Rules

1. **Save the artifact first.** Before updating CLAUDE.md or writing code, write the full analysis to `docs/research/<topic>-<YYYY-MM-DD>.md`. Include raw findings, not just conclusions.
2. **Reference, don't inline.** CLAUDE.md roadmap items that come from research must cite their source: `(see docs/research/historio-analysis-2026-02-19.md)`. Bullets without context rot.
3. **Create Linear tickets.** Research that identifies work items must produce Linear tickets with acceptance criteria, not just roadmap bullets. Bullets get forgotten. Tickets get done.
4. **Architecture decisions go to `docs/decisions.md`.** If you evaluated tradeoffs and chose an approach, record the decision, the alternatives considered, and why. Date it.
5. **Never let a session end with insights only in the conversation.** If you did competitive research, user interviews, strategic analysis, debugging archaeology, or any deep investigation — the findings must exist in a file before the session ends.

### Competitive Research Template

When analyzing a competitor, save to `docs/research/<competitor>-<date>.md`:

```markdown
# [Competitor] Competitive Analysis — [Date]

## Applicable To
- **Projects**: [e.g., fictotum, quraishi-hq]
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
- Actionable items with Linear ticket references (e.g., CHR-XXX, QHQ-XXX)
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

## Executive Operating Model

George operates in "executive mode" from the big-heavy root:

- **`cofounder` skill**: Strategic thinking partner — never writes code, thinks at the business level, challenges direction, identifies cross-project synergies. Persistent memory at `~/.claude/cofounder/memory.json` (v2 schema).
- **`chief-of-staff` agent**: Portfolio briefings, delegation plans, roadmap awareness — reads all 7 project CLAUDE.md files, panel status, cofounder memory, Linear tickets, and active roadmaps.
- Each project has a **standardized CLAUDE.md** with `## Current State` and `## Roadmap` sections that agents read to orient
- Agents update `## Current State` at the end of significant work sessions — CLAUDE.md IS the state, git history IS the log
- E2E tests and strategic tooling live in `csuite/`

### Try It Yourself First

Before asking George to do something manually (create a token, click a dashboard button, copy a value), check whether it can be done via CLI, API, or automation. The answer is usually yes. Examples:
- Sentry → use the Sentry API with auth tokens in `.env.shared`
- Vercel env vars → `vercel env add/rm` via CLI
- Stripe settings → check if there's a Stripe CLI or API equivalent
- Linear → GraphQL API with `LINEAR_API_KEY`
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

**Why it works**: `/sprint` optimizes for speed and coverage. `/review` catches security issues, dead code, and overly broad patterns that slip through. Fixing only HIGH+ keeps the cycle fast — MEDIUM/LOW go to Linear backlog.

**When to extend**: If `/review` surfaces issues worth tracking, create Linear tickets in the same session rather than carrying them as debrief action items (3-debrief rule: if an item survives 3 debriefs, it becomes a ticket immediately).

## Daily Operations

### Standup (`/standup`)

Run `/standup` from the root session to get a 3-minute automated briefing. Works anytime — start of a work session, after a break, or when switching context. It silently collects data from 7 sources:
1. All 7 project CLAUDE.md `## Current State` sections
2. `git log --oneline --since="yesterday"` per project
3. `~/.big-heavy-panels/*.json` for active/ended panels
4. `~/.claude/cofounder/memory.json` (priorities, follow-ups, people)
5. Linear API for open/in-progress/blocked/stale issues across all teams
6. Active roadmaps in `<project>/docs/roadmaps/`
7. earthly-delights `cofounder-state.ts` for live deposit/agreement data

Output includes: portfolio pulse, Linear tracker, roadmap progress, overdue follow-ups, recommended focus, and autonomous panel prompts ready to paste into project panels.

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
1. Reads project CLAUDE.md, cofounder memory, Linear tickets, and previous roadmap
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
- **Context**: yesterday's commits, CLAUDE.md state, cofounder notes, roadmap milestone, Linear tickets
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

- **Separate repos**: `quraishi-hq`, `gallery`
- **Monorepo subdirectories**: `muttered`, `fictotum`, `earthly-delights`, `ronin`, `accountant`

When running git commands across projects (e.g., in `/standup`), always `cd` into the project directory or use `git -C <project-dir>`. Do NOT use `git log -- <subdir>/` from the monorepo root for separate repos — it returns nothing.
