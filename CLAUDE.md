# Project Ronin

## What Is This?
Agent inventory and management tool for Claude Code users. Scans the local filesystem (`~/.claude/`) to discover and catalog subagents, skills, MCP integrations, and project configurations.

## Vision
"Universal Agent Control Plane" — a masterless agent inventory where AI agents belong to the user, not the platform. MVP focuses on Claude Code auto-discovery.

## Tech Stack
- **Scanner:** Node.js + TypeScript CLI
- **Dashboard:** Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Database:** SQLite (local-first, no server required)
- **Distribution:** npm package (`npx ronin scan`)

## Key Files
- `PRD.md` — Product requirements document
- `seed-inventory.json` — George's actual agent inventory (36 agents, first export)

## Architecture Decisions
- **Local-first:** No accounts, no server, no API keys for v1. Privacy by default.
- **Proto-Passport schema:** Extensible JSON format for agent identity. `metadata` JSONB field is the escape hatch for future fields.
- **Zero manual entry:** If the user has to type agent details, we've failed. Auto-scan everything.
- **Claude Code beachhead:** Start where the filesystem conventions make auto-discovery trivial. Other platforms later.

## Design Principles
- "Agent Engineering for non-engineers" — structured intent capture, not raw prompt editing
- Ronin metaphor: warriors without a master. Agents don't belong to a platform.
- The Yard (inventory), the Dossier (detail), the Forge (creation) — later.
