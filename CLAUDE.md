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

## Current State
_Last updated: 2026-02-18_

Scanner is functional with multi-platform support. 50 passports in the database across 3 platforms (Claude Code, Cursor, Codex). M1 and M2.5 complete. Dashboard has Yard view with portfolio stats and Dossier detail with source viewer, usage stats, and Cursor editor integration.

### Recent Completions
- M1: Scanner CLI — parses agents, skills, CLAUDE.md, .mcp.json, settings into Proto-Passport JSON
- M2.5: Multi-platform scanner — Cursor support, platform filter, Codex parser added
- First cross-platform import: Codex "Big Heavy Bookkeeper" skill imported into Ronin DB
- Dashboard with Yard view, search/filter, Dossier detail, SQLite persistence
- Dossier enhancements: collapsible source viewer, Cursor editor link, per-project usage stats (session count, last active, session data size), portfolio "most active" in Yard header
- Secret redaction in source viewer for `.mcp.json` and `settings.json` files
- Security notes documenting multi-user migration blockers
- 50 passports: 43 Claude Code, 6 Cursor, 1 Codex

### Active Work
- M3: Dog-food & polish — cataloging full agent library, testing cross-platform workflows

### Known Issues
- Node 25 + `brace-expansion` (via `glob`) compat issue prevents `ronin scan` from running; needs `npm update glob` or Node version pin
- Cross-platform scan (M2.5) is code-complete but blocked by the Node 25 issue above
- Neo4j Aura password needs rotation (was exposed in git history via source viewer before redaction fix)

## Roadmap
### Immediate (This Sprint)
- Fix Node 25 compat issue (glob/brace-expansion)
- M3: Dog-food & polish (catalog full library, README, demo video)

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
