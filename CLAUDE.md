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
- **Scanner** discovers: subagents (`~/.claude/agents/*.md`), skills (`~/.claude/skills/*/SKILL.md`), project configs, CLAUDE.md files, MCP servers (`.mcp.json`), settings
- **Proto-Passport schema**: Extensible JSON format for agent identity with `metadata` JSONB escape hatch
- **Zero manual entry**: If the user has to type agent details, we've failed
- **Local-first**: No accounts, no server, no API keys for v1

**Key files:**
- `PRD.md` — Product requirements document (v0.1 draft)
- `seed-inventory.json` — George's actual agent inventory (36 agents across 7 projects)

## Current State
_Last updated: 2026-02-17_

Early build phase. PRD is written. Seed inventory exported (36 agents). No milestones completed yet — all four milestones (M1-M4) are pending.

### Recent Completions
- PRD v0.1 drafted
- Seed inventory exported (36 agents from George's setup)
- Architecture decisions locked (local-first, SQLite, Proto-Passport schema)

### Active Work
- M1: Scanner — parse agents, skills, CLAUDE.md, .mcp.json into Proto-Passport JSON

### Known Issues
- Nothing built yet beyond planning artifacts

## Roadmap
### Immediate (This Sprint)
- M1: Scanner CLI that discovers and catalogs all agent types

### Next (2-4 weeks)
- M2: Dashboard (Next.js app with Yard view, search/filter, Dossier detail, SQLite persistence)

### Future (Backlog)
- M3: Dog-food & polish (George catalogs full library, README, demo video)
- M4: Distribution (npm publish, community outreach)
- Cloud sync + accounts
- Team Yards with role-based access
- Cross-platform scan (beyond Claude Code)
- Gallery (public agent marketplace)

## Conventions
- Local-first: privacy by default, no network calls in v1
- Proto-Passport schema for all agent identity data
- Ronin metaphor: "warriors without a master" — agents don't belong to a platform
- The Yard (inventory), the Dossier (detail), the Forge (creation)

**Maintenance**: Agents should update `## Current State` at the end of significant work sessions. Bump the `_Last updated_` date.
