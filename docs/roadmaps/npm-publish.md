# Whizmob — Ship to npm

## North Star
Whizmob ships as an npm package that any Claude Code user can run, get value from in 5 minutes, and optionally explore constellations as the power feature.

## Milestones

### M1: Ship-Ready Quality Gate — Complete
- **Why it matters**: Everything is built, but it's George's personal tool on George's machine with George's paths. This milestone makes it someone-else's-tool.
- **Acceptance criteria**:
  - [x] Smoke-test constellation UI in browser — dashboard builds clean, all routes verified (list, detail, export, import, API routes)
  - [x] Fix hardcoded paths: hook script resolves dynamically via `BASH_SOURCE`, `/roster` skill uses `command -v whizmob || npx whizmob`, dashboard uses `toDisplayPath()` utility
  - [x] Extract shared SQLite schema into `src/schema.ts` (single source of truth for CLI + constellation module; dashboard synced with comment)
  - [x] Fix N+1 query in `getPassports` — single `IN (...)` query + Map grouping replaces 91 per-row queries (BIG-13)
  - [x] Escape LIKE wildcards in search — `|` escape prefix with `ESCAPE '|'` clause
  - [x] `npx whizmob scan` works on a clean machine — `mkdirSync(recursive)` already in place, no-DB guards on all read paths
  - [x] Basic test suite: 26 tests across 4 suites (schema, scanner, constellation CRUD, export/import pipeline)
  - [x] Clean terminal output — verified: errors use `[whizmob]` prefix to stderr, data goes to stdout for piping
  - [x] package.json: `files` field added (`dist/`, `dashboard/`, exclusions for `.next/` and `node_modules/`), license already MIT
  - [x] Fixed lucide-react 0.468→0.575 for Next.js 16 Turbopack compatibility
  - [x] Unsafe `as unknown as PassportRow` cast replaced with explicit field mapping
  - [x] `getPassport(id)` refactored to single LEFT JOIN query
  - [x] `WHIZMOB_DB_PATH` env var override for testable constellation/export modules
- **Key files**: `src/schema.ts` (new), `src/db.ts`, `src/constellation.ts`, `src/export.ts`, `dashboard/lib/db.ts`, `dashboard/lib/paths.ts` (new), `hooks/roster-inject.sh`, `tests/` (new)

### M2: Public Release — Not Started
- **Why it matters**: Whizmob has been "almost ready" for weeks. Ship it.
- **Acceptance criteria**:
  - [ ] README with: what it does (30 sec), quick start, dashboard screenshot, constellation explainer
  - [ ] `npm publish` succeeds
  - [ ] `npx whizmob scan` → `npx whizmob dashboard` flow documented and working
  - [ ] `whizmob stats` output polished for demo
- **Needs George**: README direction, final publish approval

### M3: Dog-food + Translation Validation — Blocked
- **Why it matters**: Cross-machine porting is the constellation proof point. Translation images are compelling content.
- **Acceptance criteria**:
  - [ ] Port CEO Operating System to work machine via export/import
  - [ ] Run 6-image translation test (baseline vs. translated across 3 platforms)
  - [ ] Populate dashboard translation page with real images
  - [ ] Document friction from dog-food → file as issues
- **Blocked on**: work machine access, image generation API access

## Deferred
- **Cloud sync / accounts** — local-first for v1
- **Team inventories / role-based access** — enterprise, premature
- **Gallery (marketplace)** — needs users first
- **`whizmob constellation detect`** — auto-detection heuristics, manual `define` works
- **Linear team for whizmob** — when there are external contributors

## Risks
- **README scope creep** — timebox to one session.
- **Work machine access keeps slipping** — M3 has been "next week" since Feb. Consider VM workaround.

## Known Bug Surfaced
- `addComponents` allows duplicate file-path-only components when `passport_id` is NULL (SQLite UNIQUE treats NULL != NULL). Fix: covering partial index or non-NULL enforcement.
