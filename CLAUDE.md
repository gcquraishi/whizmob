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
- `src/constellation.ts` — Constellation CRUD (define, add, list, show, delete)
- `src/export.ts` — Constellation export engine (path rewriting, secret stripping, memory bootstrapping)
- `src/import.ts` — Constellation import engine (parameter resolution, conflict detection, dry-run)
- `hooks/roster-inject.sh` — SessionStart hook script

## Current State
_Last updated: 2026-02-23_

Scanner discovers 91 passports across 3 platforms (Claude Code, Cursor, Codex), including both user-level and project-level agents. `ronin roster` CLI bridges the inventory into Claude Code sessions via a SessionStart hook. `ronin translate` provides two-stage skill translation (Source → Canonical → Target) to DALL-E, Midjourney, and Gemini platforms. Constellations data model is live with export/import engine — users can define named groups of agents, package them as portable bundles with path rewriting and secret stripping, and import them onto another machine.

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
- Fixed Node 25 compat issue (updated commander to v14, glob 11→13)
- 91 passports: 57 subagents (21 user + 36 project), 20 skills, 3 MCP, 10 projects, 1 settings
- **Constellations M1** — data model for grouping agents into systems:
  - Schema: `constellations` + `constellation_components` tables in both CLI and dashboard DBs
  - CRUD: `src/constellation.ts` with define, addComponents, get, list, delete, removeComponent
  - CLI: `ronin constellation define|list|show|add-component|remove-component|delete`
  - Component types: `passport`, `hook`, `memory_schema`, `claude_md`, `config`
  - Input validation: component type checking, empty slug guard
- **Constellations M2** — export/import engine for constellation portability:
  - **Export** (`src/export.ts`): `ronin export <constellation>` produces a portable bundle with `manifest.json`
  - Path rewriting: absolute paths → parameterized `{{HOME}}`, `{{CLAUDE_DIR}}`, `{{RONIN_DIR}}`
  - Secret stripping: tokens/keys/passwords redacted, `.mcp.json` env blocks sanitized
  - Memory bootstrapping: exports structure of `memory.json` (empty values, preserved keys)
  - Dependency detection: flags required MCP servers and npm packages
  - **Import** (`src/import.ts`): `ronin import <bundle>` with `--dry-run`, `--force`, `--param` overrides
  - Conflict detection: warns about existing files, skips unless `--force`
  - Git-friendly bundles: `.gitignore` included, no binaries
- **`ronin translate` CLI** — two-stage skill translation engine:
  - **Canonical engine** (`src/canonical.ts`): 9-rule pipeline — `STRIP_FRONTMATTER`, `STRIP_DISPATCH_EXAMPLES`, `GENERALIZE_TOOL_REFS`, `GENERALIZE_PATHS`, `FLATTEN_ESCALATION`, `PLATFORM_LOCKED` detection, `ENHANCE_NATIVE_CAPABILITY` flagging
  - **Target adapters** (`src/adapters/`): Gemini (~80% fidelity), DALL-E (~60%, negative rephrasing + color annotation), Midjourney (~30%, vocab expansion + `--no` extraction + reference doc reformat)
  - **Adapter registry** with `getAdapter()`, `listAdapters()`, `isValidTarget()`
  - **`translations` DB table** tracking source passport, target platform, rules applied, review items
  - **CLI**: `ronin translate illustrator --to dalle midjourney gemini`, `--list`, `--dry-run`, `--output <dir>`
  - Output: `~/.ronin/translations/<skill>/` with `canonical.md`, per-target `.md` files, `manifest.json`

### Active Work
- Constellations M3: Provenance & licensing metadata
- M4: Dog-food — port the CEO system between machines
- **Translation validation**: Compare `ronin translate` output against gold standards in `translation-test-prompts.md` and `gemini/illustrator/art-director.md`
- **Translation test**: Ready-to-run prompts in `ronin/translation-test-prompts.md` — generate 6 images (3 raw baseline + 3 ronin-translated) across DALL-E, Midjourney, and Gemini for the same Roman statesman subject. Output goes to `ronin/translation-test-images/`. When George asks to "run the translation test" or "surface the prompts," read that file and present the prompts.
- **Translation flow artifacts**: `translation-diff.html` (Claude→Gemini tracked changes), `translation-multi-target.html` (3-target comparison), `translation-flow.html` (visual flow diagram)
- **Dashboard translation page** live at `/translation` — ported from `landing-comparison.html` into proper React/Tailwind page with nav bar (Yard + Translation links). Includes flow diagram, "what changes" table, image comparison grid with toggle. Awaiting generated images.
- **Kellan Elliott-McCrea intro** — email drafted, 10 Q&A prep complete, `ronin stats` command recommended before call. Linear: BIG-6 for image generation.

### Known Issues
- ~~**CRITICAL: XSS in middleware login page** — `returnTo` interpolated into inline `<script>` without escaping. Linear: BIG-10~~ **FIXED** (sanitizeReturnTo + encodeURIComponent)
- ~~**Auth cookie stores plaintext password** — raw `DEMO_PASSWORD` in browser cookie. Linear: BIG-11~~ **FIXED** (SHA-256 derived session token, httpOnly/secure)
- ~~**Basic auth crashes on malformed header** — missing guard on `encoded` before `atob()`. Linear: BIG-12~~ **FIXED** (guard on encoded before atob)
- **N+1 query in getPassports** — per-row tag fetch runs 91 separate queries (`lib/db.ts:267-278`). Linear: BIG-13
- **Unsafe `as unknown as PassportRow` cast** — double cast bypasses structural checks (`lib/db.ts:278`)
- **LIKE search doesn't escape wildcards** — `%` and `_` in search terms act as SQL wildcards (`lib/db.ts:250-253`)
- ~~**No input validation on auth POST body** — malformed JSON or non-string password throws unhandled error~~ **FIXED** (try/catch + type checking, returns 400)
- Neo4j Aura password needs rotation (was exposed in git history via source viewer before redaction fix)
- Schema duplication between `src/db.ts` (CLI, better-sqlite3), `dashboard/lib/db.ts` (dashboard, sql.js), and `src/constellation.ts` — needs shared schema extraction
- Hardcoded paths in hook script and `/roster` skill — will resolve when published to npm (`npx ronin roster`)
- Roster search matches too broadly on purpose text (LIKE `%query%`) — needs relevance scoring improvement

## Roadmap
### Immediate (This Sprint)
- Constellations M3: Provenance & licensing metadata (origin, author, license, forkedFrom)
- M4: Dog-food — port the CEO Operating System constellation between machines
- M5: Constellation-aware roster (group agents by constellation in hook output)
- Extract shared SQLite schema between CLI, dashboard, and constellation module
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

## Session Close Protocol

Before ending a work session:
1. Update `## Current State` with what was accomplished
2. Bump `_Last updated_` date
3. Commit changes with a descriptive message
4. If blocked, document the blocker under Known Issues
