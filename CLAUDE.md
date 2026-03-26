# Whizmob

## Identity
- **Domain**: whizmob.dev (landing page)
- **Hosting**: Vercel (hobby) for site; CLI is local-first
- **Ticket Prefix**: BIG
- **Root Config**: See ../CLAUDE.md for shared infrastructure

## Overview
Agent inventory and management tool for Claude Code users. Scans `~/.claude/` to discover and catalog subagents, skills, MCP integrations, and project configurations. Vision: "Universal Agent Control Plane" — a masterless agent inventory where AI agents belong to the user, not the platform.

## Tech Stack
- **Scanner**: Node.js + TypeScript CLI
- **Dashboard**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Database**: SQLite (local-first, no server required)
- **Distribution**: npm package (`npx whizmob scan`)

## Architecture
- **Scanner** discovers agents across Claude Code (`~/.claude/`), Codex (`~/.codex/`), Cursor (`~/.cursor/`)
- **Proto-Passport schema**: Extensible JSON format for agent identity with `metadata` JSONB escape hatch
- **Edge inference** (`src/edges.ts`): detects file path refs, skill invocations, shared state between passports
- **Mob clustering**: BFS connected components from edge graph; hierarchy via `mob_children` table
- **Export/Import** (`src/export.ts`, `src/import.ts`): portable bundles with path rewriting, secret stripping, content parameterization
- **Smart update** (`src/update.ts`): three-way change classification via content hashing
- **Zero manual entry, local-first**: no accounts, no server, no API keys for v1
- **Shared schema**: `src/schema.ts` is the single source of truth for all SQLite tables

## Current State
_Last updated: 2026-03-26_

**Published**: `whizmob@0.1.3` on npm. 135 tests across 12 suites.

Scanner discovers 108 passports across 3 platforms, infers 129+ edges. Mob Inspector dashboard with force-directed graph, mode badges/filters, and scroll-linked detail cards. Full mob hierarchy with auto-discovery, convex hull visualization, and granular export/import. Smart update engine. Demo mode (`whizmob demo`) generates self-contained HTML.

**Active**: Browser Scanner (M2) — landing page "Scan your machine" button uses File System Access API (Chrome/Edge). Users select `~/.claude/` and see agents as force-directed graph with edge inference and mob clustering, entirely client-side. Unsupported browsers fall back to CLI command.

### Known Issues
- **Duplicate file-path components** — `addComponents` allows duplicates when `passport_id` is NULL (SQLite UNIQUE treats NULL != NULL). Fix: covering partial index or non-NULL enforcement.
- Roster search matches too broadly (LIKE `%query%`) — needs relevance scoring improvement.
- **Next.js 16 middleware deprecation** — `middleware.ts` should be renamed to `proxy.ts`. Low priority.
- Neo4j Aura password needs rotation (was exposed in git history before redaction fix).

## Publishing

```bash
npm run build && npm test && npm publish
```

- **npm account**: `big-heavy` on npmjs.com
- **Auth**: granular access token (90-day expiry) via `npm config set //registry.npmjs.org/:_authToken=<token>`
- **2FA**: npm requires granular access token with publish permissions
- **Size check**: `npm pack --dry-run 2>&1 | grep "unpacked size"` — target <600KB
- **Exclusions**: test images, `tsconfig.tsbuildinfo`, `package-lock.json`, `dashboard/` excluded via `files` in `package.json`

## Roadmap
**Completed**: Mob Inspector (M1-M4), Mob Hierarchy (M1-M4), Mode field + dashboard visualization, Landing page redesign, npm publish (v0.1.0-v0.1.3), Constellation versioning (M2), CEO OS templatization, Public launch + history scrub.

### Immediate
- **Dog-food** — CEO OS bundle ready: `npx whizmob import ceo-operating-system --param '{{OWNER_NAME}}=George' ...`
- **Next roadmap** — needs planning session (`/roadmap whizmob`)
- **Translation validation** — run translation image test (needs API access)

### Future (Backlog)
- Cloud sync + accounts
- Team inventories with role-based access
- Gallery (public agent marketplace)
- Improve roster search relevance scoring

## Security Notes
- **Source viewer reads files at request time** from the local filesystem. Safe for local-only but **must not ship to multi-user without rearchitecting**: snapshot at scan time, add auth to all API routes, sandbox file reads to known scan roots.
- **Secret redaction** covers `env` blocks in `.mcp.json`/`settings.json` plus keys matching `password|secret|token|key|credential`. Defense-in-depth for local dashboard; not sufficient as a hosted security boundary.

## Conventions
- Local-first: privacy by default, no network calls in v1
- Proto-Passport schema for all agent identity data
- Whizmob metaphor: agents don't belong to a platform — they belong to you
- **overview.md required**: Every mob export must include an `overview.md` (auto-generated from manifest). Listed as `component_type: 'documentation'`, skipped during import.
- **`resolveDbPath()` pattern**: All DB-opening modules check `WHIZMOB_DB_PATH` env var first, falling back to `~/.whizmob/whizmob.db`. Enables test isolation.
- **`resolveProfilesDir()` pattern**: Import profiles check `WHIZMOB_PROFILES_DIR` env var first. Tests must set this.
- **LIKE escaping**: Any LIKE query on user input must escape `%`, `_`, `|` with `|` prefix and `ESCAPE '|'` clause.

## Session Close Protocol

Run `/close` before ending any panel session.
