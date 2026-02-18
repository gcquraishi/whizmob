# Ronin

## Identity
- **Domain**: None (npm package: `npx ronin scan`)
- **Hosting**: None (local-first CLI + dashboard)
- **Linear Team**: None
- **Root Config**: See ../CLAUDE.md for shared infrastructure

## Overview
Agent inventory and management tool for Claude Code users. Scans the local filesystem (`~/.claude/`) to discover and catalog subagents, skills, MCP integrations, and project configurations. Vision: "Universal Agent Control Plane" — a masterless agent inventory where AI agents belong to the user, not the platform.

## Tech Stack
- **Scanner**: Node.js + TypeScript CLI
- **Dashboard**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Database**: SQLite (local-first, no server required)
- **Distribution**: npm package (`npx ronin scan`)

## Architecture
- **Scanner** discovers: subagents, skills, project configs, CLAUDE.md files, MCP servers, settings across Claude Code (`~/.claude/`), Codex (`~/.codex/`), Cursor (`~/.cursor/`), and more
- **Proto-Passport schema**: Extensible JSON format for agent identity with `metadata` JSONB escape hatch
- **Zero manual entry**: If the user has to type agent details, we've failed
- **Local-first**: No accounts, no server, no API keys for v1

**Key files:**
- `PRD.md` — Product requirements document (v0.1 draft)
- `seed-inventory.json` — George's initial agent inventory export (36 agents)
- `src/roster.ts` — Roster query engine (compact, hook, search modes)
- `src/db.ts` — CLI-side SQLite import (better-sqlite3)
- `hooks/roster-inject.sh` — SessionStart hook script

## Current State
_Last updated: 2026-02-18_

Scanner discovers 91 passports across 3 platforms (Claude Code, Cursor, Codex), including both user-level and project-level agents. `ronin roster` CLI bridges the inventory into Claude Code sessions via a SessionStart hook, solving the "I don't see that agent" discoverability problem. `ronin scan` now auto-imports into the SQLite DB.

### Recent Completions
- M1: Scanner CLI — parses agents, skills, CLAUDE.md, .mcp.json, settings into Proto-Passport JSON
- M2.5: Multi-platform scanner — Cursor support, platform filter, Codex parser added
- Dashboard with Yard view, search/filter, Dossier detail, SQLite persistence
- Dossier enhancements: collapsible source viewer, Cursor editor link, per-project usage stats
- Secret redaction in source viewer for `.mcp.json` and `settings.json` files
- **`ronin roster` CLI** — queries SQLite DB for agent lookups (`--search`, `--type`, `--platform`, `--hook`)
- **SessionStart hook** — injects compact agent roster into every Claude Code session (startup + compact)
- **`/roster` skill** — on-demand agent search from within Claude Code sessions
- **Project-level agent scanning** — discovers `.claude/agents/` within project directories (not just `~/.claude/agents/`)
- **Auto-import on scan** — `ronin scan` writes directly to `~/.ronin/ronin.db` via `better-sqlite3` (skip with `--no-import`)
- Fixed Node 25 compat issue (updated commander to v14)
- 91 passports: 57 subagents (21 user + 36 project), 20 skills, 3 MCP, 10 projects, 1 settings

### Active Work
- M3: Dog-food & polish — cataloging full agent library, testing cross-platform workflows

### Known Issues
- Neo4j Aura password needs rotation (was exposed in git history via source viewer before redaction fix)
- Schema duplication between `src/db.ts` (CLI, better-sqlite3) and `dashboard/lib/db.ts` (dashboard, sql.js) — needs shared schema extraction
- Hardcoded paths in hook script and `/roster` skill — will resolve when published to npm (`npx ronin roster`)
- Roster search matches too broadly on purpose text (LIKE `%query%`) — needs relevance scoring improvement

## Roadmap
### Immediate (This Sprint)
- M3: Dog-food & polish (catalog full library, README, demo video)
- Extract shared SQLite schema between CLI and dashboard
- Improve roster search relevance scoring

### Next (2-4 weeks)
- M4: Distribution (npm publish, community outreach)

### Future (Backlog)
- Cloud sync + accounts
- Team Yards with role-based access
- Gallery (public agent marketplace)
- Codex agents parser (beyond skills — if Codex adds agent-like configs)

## Security Notes
- **Source viewer reads files at request time** from the local filesystem. This is safe for local-only use but **must not ship to multi-user without rearchitecting**. When cloud sync / Team Yards are built:
  1. Snapshot source content at scan time instead of reading live files on demand
  2. Add auth to all API routes (currently zero auth — acceptable local-only, fatal multi-user)
  3. Sandbox file reads to known scan roots, not arbitrary paths under homedir
- **Secret redaction** (`source/route.ts`) redacts `env` blocks in `.mcp.json` and `settings.json`, plus any key matching `password|secret|token|key|credential`. This is defense-in-depth for the local dashboard; it is not sufficient as a security boundary for a hosted service.

## Conventions
- Local-first: privacy by default, no network calls in v1
- Proto-Passport schema for all agent identity data
- Ronin metaphor: "warriors without a master" — agents don't belong to a platform
- The Yard (inventory), the Dossier (detail), the Forge (creation)

**Maintenance**: Agents should update `## Current State` at the end of significant work sessions. Bump the `_Last updated_` date.
