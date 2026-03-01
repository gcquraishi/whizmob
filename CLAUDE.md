# Whizmob

## Identity
- **Domain**: None (npm package: `npx whizmob scan`)
- **Hosting**: None (local-first CLI + dashboard)
- **Ticket Prefix**: BIG
- **Root Config**: See ../CLAUDE.md for shared infrastructure

## Overview
Agent inventory and management tool for Claude Code users. Scans the local filesystem (`~/.claude/`) to discover and catalog subagents, skills, MCP integrations, and project configurations. Vision: "Universal Agent Control Plane" — a masterless agent inventory where AI agents belong to the user, not the platform.

## Tech Stack
- **Scanner**: Node.js + TypeScript CLI
- **Dashboard**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Database**: SQLite (local-first, no server required)
- **Distribution**: npm package (`npx whizmob scan`)

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
- `src/sync.ts` — Constellation sync engine (change detection, inline diff)
- `hooks/roster-inject.sh` — SessionStart hook script

## Current State
_Last updated: 2026-03-01_

**Published on npm as `whizmob@0.1.3`.** Scanner discovers 97 passports across 3 platforms (Claude Code, Cursor, Codex), including both user-level and project-level agents. `whizmob roster` CLI bridges the inventory into Claude Code sessions via a SessionStart hook — now constellation-aware, grouping agents by system. `whizmob translate` provides two-stage skill translation (Source → Canonical → Target) to DALL-E, Midjourney, and Gemini platforms. Constellations (now called "mobs" in the UI) are fully operational: define groups, export portable bundles with path rewriting/secret stripping/memory bootstrapping, import onto other machines, sync to detect changes, and track provenance (origin, author, license). **Named bundle resolution** — `whizmob import ceo-operating-system` resolves to bundled exports shipped with the npm package; `whizmob import --list` shows available bundles. **Content parameterization verified** — CEO OS constellation (v3) templatized with 5 content parameters (`OWNER_NAME`, `ORG_NAME`, `WORKSPACE_ROOT`, `VAULT_PATH`, `PANEL_REGISTRY_DIR`). All 11 files stripped of hardcoded org references; import substitutes from `--param` flags. **Constellation versioning complete** — re-exports auto-detect changes via sync diff, bump `bundle_version`, and append changelog entries. Import profiles track `last_imported_version`. Dashboard removed from npm tarball (was 90% of package size). 43 tests across 4 suites. Dog-food tested on work machine — dry-run succeeds, blocked on GitHub repo going public for full trust. **Dashboard mob graph view** — interactive force-directed graph at `/mobs` showing mob-to-component relationships with drag, hover, click navigation, and shared-component cross-links.

### Recent Completions (Mob Graph View — 2026-03-01)
- **Force-directed graph visualization** (`dashboard/components/MobGraph.tsx`) — canvas-based graph with vanilla JS force simulation (no external deps). Mob nodes (large, indigo) connect to component nodes (small, color-coded by type). Shared components create dashed cross-links between mobs.
- **Dual view** (`dashboard/app/mobs/page.tsx`) — toggle between card grid (existing) and interactive graph view. Graph supports drag-to-reposition, hover tooltips, click-to-navigate (mob → detail, component → detail).
- **Graph data API** (`dashboard/app/api/mobs/graph/route.ts`, `dashboard/lib/db.ts`) — `getMobGraphData()` returns nodes + edges with shared-component detection.
- **Constellation → Mob rename** — all dashboard UI labels (nav, page titles, back buttons, descriptions, import page) say "Mob" instead of "Constellation". Internal code/DB unchanged.
- **Old /constellations path redirects to /mobs**.

### Recent Completions (Named Bundles + Templatization v3 — 2026-02-27)
- **Named bundle resolution** (`src/import.ts`) — `resolveBundlePath()` detects whether import argument is a filesystem path or named bundle, resolves named bundles from `<package-root>/exports/<name>/`. `listBundledExports()` reads all bundled manifests for `--list` output.
- **CLI wiring** (`src/index.ts`) — import command accepts optional `[bundle]` arg, added `--list` flag, logs resolved path for named bundles.
- **CEO OS v3 templatization** — all 11 bundled files (8 skills/agents, 2 hooks, 1 memory schema) stripped of 68+ hardcoded references. Removed org-specific CLAUDE.md from bundle. Panel hooks rewritten to use `basename` detection instead of hardcoded case statements. Ticket prefix tables replaced with dynamic discovery. Memory schema bootstrapped empty.
- **5 content parameters** — `OWNER_NAME`, `ORG_NAME`, `WORKSPACE_ROOT`, `VAULT_PATH`, `PANEL_REGISTRY_DIR` (with default `~/.ceo-os-panels`).
- **Tilde expansion** — `expandTilde()` added to `deparameterizePath()` since Node.js `existsSync('~/...')` doesn't expand `~`.
- **Dashboard removed from npm tarball** — was shipping `dashboard/` including personal `whizmob.db` snapshot. Package size 653KB → 377KB.
- **Published v0.1.2 + v0.1.3** — v0.1.2 added named resolution; v0.1.3 added templatized bundle.
- **BIG-50 created** — GitHub org migration (`bigheavyio`, owned by `george@bigheavy.fun`).

### Recent Completions (Constellation Versioning — M2)
- **`bundle_version` + `changelog[]`** in `ExportManifest` — re-export to same directory auto-increments version and appends changelog entry with timestamp, summary, and files changed. Sync engine detects modified files.
- **Structured import profiles** — `ImportProfile` type with `params` + `last_imported_version`. `loadFullProfile()` reads both v1 (flat) and v2 (structured) formats. `saveImportProfile()` stores bundle version.
- **CLI integration** — export shows version + changelog; import filters changelog to entries since last imported version.
- **Cross-account portability roadmap** — 4 milestones: M1 dog-food, M2 versioning (done), M3 smart update with sync agent, M4 reverse flow.
- **5 new tests** — first export version, re-export bumps version, profile version storage, nonexistent profile, v1 format migration.

### Recent Completions (Linear → Obsidian Migration — 2026-02-26)
- **Migrated all 487 Linear issues** to `~/Documents/brain/tickets/` as markdown files with YAML frontmatter. Migration script: `csuite/scripts/migrate-linear-to-obsidian.py`.
- **Updated 12+ skills and agents** to use direct file ops (Glob/Grep/Read/Write) instead of Linear GraphQL API.
- **All project CLAUDE.md files** updated: `Linear Team:` → `Ticket Prefix:`.
- **Prefix rename**: QHQ → MAJ for majordomo, CHR → FIC for fictotum.
- **Archive split**: done/cancelled tickets in `tickets/done/`, active/backlog in `tickets/`.
- **4 review tickets created** (BIG-36 through BIG-39) for remaining cleanup items.

### Recent Completions (Cleanup Sprint — 2026-02-26)
- **RoninInventory → WhizmobInventory rename** (BIG-19) — `RoninInventory` and `RoninStats` types renamed to `WhizmobInventory` and `WhizmobStats` across 6 source files. Zero remaining Ronin references in TypeScript.
- **`--param` key validation** (BIG-23) — `planImport()` now warns when `--param` keys don't match manifest content parameters or built-in path params. 2 new tests.
- **Import profile test isolation** — `resolveProfilesDir()` respects `WHIZMOB_PROFILES_DIR` env var (same pattern as `resolveDbPath()`). Tests no longer write to real `~/.whizmob/import-profiles/`.
- **package-lock.json regenerated** (BIG-20) — was still referencing old "ronin" name and version.
- **LINEAR_API_KEY cleanup** (BIG-25) — removed stale key from `fictotum/.env.local` that was shadowing the shared key from `.env.shared`.
- **Linear ticket cleanup** — closed 12 tickets: BIG-10/11/12/13 (already fixed), BIG-5 (test), BIG-14/15 (duplicates), BIG-16/17 (standup improvements), BIG-19/20/23/25 (completed this session).

### Recent Completions (Content Parameterization)
- **Content parameter engine** (`src/export.ts`, `src/import.ts`) — Export detects `{{UPPER_SNAKE}}` tokens in bundled file content, catalogs them in `manifest.content_parameters` with descriptions and required flags. Import resolves params from `--param` CLI flags and substitutes in file content before writing to disk. Path params (`{{HOME}}`, `{{CLAUDE_DIR}}`, `{{WHIZMOB_DIR}}`) automatically excluded from content param detection.
- **CEO OS templatized** — All 10 constellation files (6 skills, 2 agents, 2 panel hooks) stripped of Big Heavy specifics. Hardcoded project lists replaced with dynamic discovery (`{{WORKSPACE_ROOT}}/*/CLAUDE.md`). Hardcoded names/paths replaced with 6 content parameters. Trip-management urgency tiers generalized to revenue-at-risk patterns. Panel hook case statements replaced with basename detection.
- **E2E verified** — Export → Import round-trip produces 71 substitutions, zero raw tokens in output. `--dry-run` shows all content params with resolution status.
- **6 new tests** — content param detection, path param exclusion, required defaults, missing param warnings, resolution via --param, end-to-end substitution.

### Recent Completions (npm Publish — v0.1.0 + v0.1.1)
- **v0.1.0 published** — first npm release. 558KB package, 164 files. `npx whizmob scan` works.
- **v0.1.1 published** — patch release with 4 HIGH review fixes (same session).
- **Full ronin → whizmob rename** — 50+ files updated: data paths (`~/.ronin/` → `~/.whizmob/`), env vars (`RONIN_DB_PATH` → `WHIZMOB_DB_PATH`), export params (`{{RONIN_DIR}}` → `{{WHIZMOB_DIR}}`), dashboard cookies/session tokens, user-facing strings, hook paths.
- **`resolveDbPath()` pattern** — `src/db.ts` now respects `WHIZMOB_DB_PATH` env var for test isolation. All DB-opening modules use this pattern.
- **LIKE escaping in `searchRoster()`** — wildcards `%` and `_` escaped in roster search (was only fixed in `getPassports()` before).
- **Error logging in `getConstellationMemberships()`** — no longer silently swallows real errors; only suppresses expected "no such table" on first run.
- **Import provenance DB path** — `executeImport()` now uses `WHIZMOB_DB_PATH` env var instead of hardcoded path.
- **Package size optimized** — excluded translation test images (4.4MB PNGs), `tsconfig.tsbuildinfo`, `package-lock.json` from npm tarball.

### Recent Completions (Ship-Ready Quality Gate — M1)
- **N+1 query fixed** (BIG-13) — `getPassports()` now uses single `IN (...)` query + Map grouping instead of 91 per-row tag fetches. `getPassport()` refactored to LEFT JOIN.
- **Unsafe cast eliminated** — `as unknown as PassportRow` replaced with explicit field mapping in both `getPassports()` and `getPassport()`
- **LIKE wildcard escaping** — search terms with `%` and `_` are now escaped with `|` prefix + `ESCAPE '|'` clause
- **Shared schema** — `src/schema.ts` is the single source of truth for all SQLite tables. `src/db.ts` and `src/constellation.ts` import from it. Dashboard copy synced with comment.
- **Hardcoded paths removed** — hook script resolves dynamically via `BASH_SOURCE`, `/roster` skill uses `command -v whizmob || npx whizmob`, dashboard uses `toDisplayPath()` utility (`dashboard/lib/paths.ts`)
- **Test suite** — 32 tests across 4 suites (schema, scanner, constellation CRUD, export/import). `node:test` + `tsx`, zero runtime deps. `WHIZMOB_DB_PATH` env var for test isolation.
- **Dashboard compat** — `lucide-react` 0.468→0.575 for Next.js 16 Turbopack. Dashboard builds clean with all routes verified.
- **package.json** — `files` field added for npm publish (`dist/`, `dashboard/`, exclusions for `.next/` and `node_modules/`)

### Recent Completions (Prior)
- M1: Scanner CLI — parses agents, skills, CLAUDE.md, .mcp.json, settings into Proto-Passport JSON
- M2.5: Multi-platform scanner — Cursor support, platform filter, Codex parser added
- Dashboard with inventory view, search/filter, detail pages, SQLite persistence
- Detail page enhancements: collapsible source viewer, Cursor editor link, per-project usage stats
- Secret redaction in source viewer for `.mcp.json` and `settings.json` files
- **`whizmob roster` CLI** — queries SQLite DB for agent lookups (`--search`, `--type`, `--platform`, `--hook`)
- **SessionStart hook** — injects compact agent roster into every Claude Code session (startup + compact)
- **`/roster` skill** — on-demand agent search from within Claude Code sessions
- **Project-level agent scanning** — discovers `.claude/agents/` within project directories (not just `~/.claude/agents/`)
- **Auto-import on scan** — `whizmob scan` writes directly to `~/.whizmob/whizmob.db` via `better-sqlite3` (skip with `--no-import`)
- Fixed Node 25 compat issue (updated commander to v14, glob 11→13)
- 91 passports: 57 subagents (21 user + 36 project), 20 skills, 3 MCP, 10 projects, 1 settings
- **Constellations M1** — data model for grouping agents into systems:
  - Schema: `constellations` + `constellation_components` tables in both CLI and dashboard DBs
  - CRUD: `src/constellation.ts` with define, addComponents, get, list, delete, removeComponent
  - CLI: `whizmob constellation define|list|show|add-component|remove-component|delete`
  - Component types: `passport`, `hook`, `memory_schema`, `claude_md`, `config`
  - Input validation: component type checking, empty slug guard
- **Constellations M2** — export/import engine for constellation portability:
  - **Export** (`src/export.ts`): `whizmob export <constellation>` produces a portable bundle with `manifest.json`
  - Path rewriting: absolute paths → parameterized `{{HOME}}`, `{{CLAUDE_DIR}}`, `{{WHIZMOB_DIR}}`
  - Secret stripping: tokens/keys/passwords redacted, `.mcp.json` env blocks sanitized
  - Memory bootstrapping: exports structure of `memory.json` (empty values, preserved keys)
  - Dependency detection: flags required MCP servers and npm packages
  - **Import** (`src/import.ts`): `whizmob import <bundle>` with `--dry-run`, `--force`, `--param` overrides
  - Conflict detection: warns about existing files, skips unless `--force`
  - Git-friendly bundles: `.gitignore` included, no binaries
- **Constellations M3** — provenance & licensing metadata:
  - Passport schema extended: `origin`, `author`, `license` (personal/work/open/commercial), `forked_from`
  - Additive migration (ALTER TABLE) safe to run repeatedly
  - Export embeds per-file provenance in manifest; import preserves it in local DB
  - `whizmob constellation sync <bundle>` — read-only diff detection with inline changes
- **Constellations M5** — constellation-aware roster:
  - `whizmob roster --hook` groups agents by constellation before ungrouped listing
  - `whizmob roster --search` shows constellation membership per result
  - `whizmob stats` includes constellation and component counts
- **Dashboard constellation UI** — full constellation management in the web dashboard:
  - List page (`/constellations`): card grid with component counts, author, import button
  - Detail page (`/constellations/[id]`): component graph grouped by type, linked to passport detail pages, export button
  - Export from UI: calls CLI `exportConstellation()` via dynamic import, shows bundle contents, secrets stripped, dependencies
  - Import page (`/constellations/import`): enter bundle path, dry-run preview (files, conflicts, dependencies, warnings), install with optional force-overwrite
  - API routes: `GET /api/constellations`, `GET /api/constellations/[id]`, `POST /api/constellations/[id]/export`, `POST /api/constellations/import`
  - Nav updated with Constellations link
- **CEO Operating System constellation** — 12 components defined and exported:
  - Skills: cofounder, standup, roadmap, debrief, leadership-meeting, sprint
  - Agents: chief-of-staff, sprint-coordinator
  - Non-passport: cofounder memory (bootstrapped), panel-start/stop hooks, CLAUDE.md executive pattern
- **`whizmob translate` CLI** — two-stage skill translation engine:
  - **Canonical engine** (`src/canonical.ts`): 9-rule pipeline — `STRIP_FRONTMATTER`, `STRIP_DISPATCH_EXAMPLES`, `GENERALIZE_TOOL_REFS`, `GENERALIZE_PATHS`, `FLATTEN_ESCALATION`, `PLATFORM_LOCKED` detection, `ENHANCE_NATIVE_CAPABILITY` flagging
  - **Target adapters** (`src/adapters/`): Gemini (~80% fidelity), DALL-E (~60%, negative rephrasing + color annotation), Midjourney (~30%, vocab expansion + `--no` extraction + reference doc reformat)
  - **Adapter registry** with `getAdapter()`, `listAdapters()`, `isValidTarget()`
  - **`translations` DB table** tracking source passport, target platform, rules applied, review items
  - **CLI**: `whizmob translate illustrator --to dalle midjourney gemini`, `--list`, `--dry-run`, `--output <dir>`
  - Output: `~/.whizmob/translations/<skill>/` with `canonical.md`, per-target `.md` files, `manifest.json`

### Active Work
- **GitHub repo migration (BIG-50)** — Create `bigheavyio` org owned by `george@bigheavy.fun`, scrub `seed-inventory.json` + `dashboard/data/whizmob.db` from history, make repo public. Blocked on George creating GitHub account with business email.
- **Dog-food** — CEO OS dry-run succeeds on work machine. Blocked on BIG-50 (Claude Code refuses to install packages without public repo). Command ready: `npx whizmob import ceo-operating-system --param '{{OWNER_NAME}}=George' --param '{{ORG_NAME}}=CONEX' ...`
- **Cross-account portability roadmap** — `docs/roadmaps/cross-account-portability.md`. M2 (versioning) complete. Next: M3 (smart update with sync agent). M1 (dog-food) blocked on BIG-50.
- **Translation validation**: Ready-to-run prompts in `whizmob/translation-test-prompts.md`. Dashboard page at `/translation` awaiting images.
- **Kellan Elliott-McCrea intro** — email drafted, 10 Q&A prep complete. BIG-6.
- **Open tickets**: BIG-21 (secret redaction false positives), BIG-22 (dashboard DB casts), BIG-24 (test coverage gaps), BIG-50 (GitHub migration).

### Known Issues
- ~~**CRITICAL: XSS in middleware login page** — `returnTo` interpolated into inline `<script>` without escaping. Linear: BIG-10~~ **FIXED** (sanitizeReturnTo + encodeURIComponent)
- ~~**Auth cookie stores plaintext password** — raw `DEMO_PASSWORD` in browser cookie. Linear: BIG-11~~ **FIXED** (SHA-256 derived session token, httpOnly/secure)
- ~~**Basic auth crashes on malformed header** — missing guard on `encoded` before `atob()`. Linear: BIG-12~~ **FIXED** (guard on encoded before atob)
- ~~**N+1 query in getPassports** — per-row tag fetch runs 91 separate queries. Linear: BIG-13~~ **FIXED** (single IN query + Map grouping)
- ~~**Unsafe `as unknown as PassportRow` cast** — double cast bypasses structural checks~~ **FIXED** (explicit field mapping)
- ~~**LIKE search doesn't escape wildcards** — `%` and `_` in search terms act as SQL wildcards~~ **FIXED** (escape prefix + ESCAPE clause)
- ~~**No input validation on auth POST body** — malformed JSON or non-string password throws unhandled error~~ **FIXED** (try/catch + type checking, returns 400)
- ~~Schema duplication between `src/db.ts`, `dashboard/lib/db.ts`, and `src/constellation.ts`~~ **FIXED** (shared `src/schema.ts`, dashboard synced with comment)
- ~~Hardcoded paths in hook script and `/roster` skill~~ **FIXED** (dynamic resolution via BASH_SOURCE + command -v)
- Neo4j Aura password needs rotation (was exposed in git history via source viewer before redaction fix)
- **Duplicate file-path components** — `addComponents` allows duplicates when `passport_id` is NULL (SQLite UNIQUE treats NULL != NULL). Fix: covering partial index or non-NULL enforcement.
- Roster search matches too broadly on purpose text (LIKE `%query%`) — needs relevance scoring improvement
- **Next.js 16 middleware deprecation** — `middleware.ts` should be renamed to `proxy.ts` per Next 16 conventions. Only affects Vercel deployment (locally it's a no-op). Low priority.
- **`addComponents` allows duplicate file-path-only components** — `UNIQUE (constellation_id, passport_id, component_type, file_path)` does not deduplicate rows where `passport_id` IS NULL because SQLite treats NULL != NULL in UNIQUE indexes. Calling `addComponents` twice with the same `file_path` but no `passport_id` creates duplicate rows. Surfaced by `tests/constellation.test.ts`. Fix: use a covering partial index or require non-NULL `file_path` when `passport_id` is absent.

## Publishing

```bash
# Pre-publish checklist
npm run build                    # tsc compile
npm test                         # 32 tests across 4 suites
npm pack --dry-run 2>&1 | grep "unpacked size"  # verify <600KB
npm whoami                       # verify npm auth
npm publish                      # ship it
npm view whizmob                 # verify on registry
```

- **npm account**: `big-heavy` on npmjs.com
- **Auth**: granular access token (90-day expiry), set via `npm config set //registry.npmjs.org/:_authToken=<token>`
- **2FA**: npm requires granular access token with publish permissions; `npm adduser` alone is insufficient
- **Package exclusions**: test images, `tsconfig.tsbuildinfo`, `package-lock.json` excluded via `files` array negation in `package.json`

## Roadmap
**Active roadmap**: `docs/roadmaps/cross-account-portability.md` (M2 complete)

### Immediate
- **M3: Smart Update with Sync Agent** — three-way change classification (param-only, upstream-only, both-changed), pre-substitution content hashing, sync agent for semantic conflict resolution. `whizmob update <bundle>` command.
- **Dog-food** — port CEO OS to work machine (blocked on work machine access). Bundle, versioning, and profiles are ready.
- **Post-publish polish** — remaining open tickets: BIG-21 (secret redaction false positives), BIG-22 (dashboard DB casts), BIG-24 (test coverage gaps)

### Blocked
- **M1: Dog-food execution** — blocked on work machine access. Export/import/versioning pipeline is complete and tested.
- **Translation validation** — run translation image test (needs API access)

### Future (Backlog)
- Cloud sync + accounts
- Team inventories with role-based access
- Gallery (public agent marketplace)
- Improve roster search relevance scoring
- Codex agents parser (beyond skills — if Codex adds agent-like configs)

## Security Notes
- **Source viewer reads files at request time** from the local filesystem. This is safe for local-only use but **must not ship to multi-user without rearchitecting**. When cloud sync / team inventories are built:
  1. Snapshot source content at scan time instead of reading live files on demand
  2. Add auth to all API routes (currently zero auth — acceptable local-only, fatal multi-user)
  3. Sandbox file reads to known scan roots, not arbitrary paths under homedir
- **Secret redaction** (`source/route.ts`) redacts `env` blocks in `.mcp.json` and `settings.json`, plus any key matching `password|secret|token|key|credential`. This is defense-in-depth for the local dashboard; it is not sufficient as a security boundary for a hosted service.

## Conventions
- Local-first: privacy by default, no network calls in v1
- Proto-Passport schema for all agent identity data
- Whizmob metaphor: agents don't belong to a platform — they belong to you
- Inventory (home page listing), Detail (passport view)
- **`resolveDbPath()` pattern**: All modules that open the SQLite DB must check `process.env.WHIZMOB_DB_PATH` first, falling back to `~/.whizmob/whizmob.db`. This enables test isolation. Applies to: `src/db.ts`, `src/constellation.ts`, `src/export.ts`, `src/import.ts`, `src/roster.ts`.
- **`resolveProfilesDir()` pattern**: Import profile storage checks `process.env.WHIZMOB_PROFILES_DIR` first, falling back to `~/.whizmob/import-profiles/`. Tests must set this env var to avoid writing to the real directory.
- **LIKE escaping**: Any LIKE query on user input must escape `%`, `_`, and `|` with the `|` prefix and `ESCAPE '|'` clause. Apply in both CLI (`src/`) and dashboard (`dashboard/lib/db.ts`).

## Session Close Protocol

Before ending a work session:
1. Update `## Current State` with what was accomplished
2. Bump `_Last updated_` date
3. Commit changes with a descriptive message
4. If blocked, document the blocker under Known Issues
