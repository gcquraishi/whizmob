# Whizmob — Zero-Friction Access

## North Star
Someone lands on whizmob.dev and sees a graph of their own agents without opening a terminal.

## Milestones

### M1: One-Command Launch — Complete
- **Why it matters**: The current flow is two commands (`scan` then `dashboard`). Collapsing to one removes a drop-off point and makes the landing page CTA a single copyable line.
- **Acceptance criteria**:
  - [x] `npx whizmob scan --open` scans, starts the dashboard server, and opens the browser automatically
  - [x] If the dashboard is already running on the target port, opens the browser without starting a second server
  - [x] Landing page hero shows a single command (`npx whizmob scan --open`) instead of two separate terminal blocks
  - [x] Landing page "Open Inspector" button removed or moved — the command is the primary CTA
  - [x] `--open` flag documented in `--help` output
- **Key files**: `src/index.ts` (CLI entry), `dashboard/app/page.tsx` (landing page)

### M2: Browser Scanner — Complete
- **Why it matters**: Removes the terminal entirely. Someone on whizmob.dev clicks a button, grants folder access, and sees their agents rendered as a graph — no install, no CLI, no Node.js.
- **Acceptance criteria**:
  - [x] Landing page has a "Scan your machine" button (not salesy — just a clear action)
  - [x] Clicking it opens a native directory picker (`showDirectoryPicker()`) defaulting to the home directory
  - [x] User selects `~/.claude/` (or any config directory) and the browser reads agent files, skills, MCP configs, and settings
  - [x] Parsed passports are displayed as an interactive force-directed graph on the same page — same visual language as the dashboard inspector
  - [x] Edge inference runs client-side: file path references, skill invocations, shared state detection
  - [x] Mob clustering (BFS connected components) runs client-side and groups are visible in the graph
  - [x] On browsers that don't support File System Access API (Firefox, Safari), the button is replaced with the `npx whizmob scan --open` command — no broken state, no "upgrade your browser" nag
  - [x] No data leaves the browser. Scanning is entirely client-side.
  - [x] Handles empty or unexpected directory contents gracefully (no agents found → clear message, not a blank screen)
- **Key files**: New `dashboard/lib/browser-scanner.ts` (port of parsers), `dashboard/components/InspectorGraph.tsx` (existing graph renderer), `dashboard/app/page.tsx` (landing page)
- **Technical notes**:
  - Scanner parsers (~590 lines across 11 files) need porting from `node:fs`/`glob` to File System Access API. Core logic (frontmatter parsing, string matching) is browser-compatible.
  - `gray-matter` has a browser build. Edge inference and clustering are pure logic — no Node dependencies.
  - Graph renderer already exists in the dashboard. The browser scanner just needs to produce the same data shape (`DiscoveredMob[]`) that the inspector consumes.
  - Chrome/Edge only for the directory picker. This is fine — the CLI fallback covers all other browsers.

## Deferred
- **JSON export/upload flow** — The person comfortable pasting JSON is already comfortable with the CLI. `whizmob demo --open` already generates a shareable HTML file. No unique value.
- **Custom protocol handler (`whizmob://`)** — High effort, marginal improvement over the one-command flow.
- **Browser extension** — Right answer long-term if the tool finds an audience, but premature now.
- **Localhost bridge** — `https` page fetching from `http://localhost` is blocked as mixed content. Not worth the workaround complexity.

## Dependencies
- None. Both milestones are self-contained within the whizmob repo.

## Risks
- **File System Access API browser support** — Chrome/Edge only (~70% desktop browser share). Mitigated by the CLI fallback, which is shown to non-supporting browsers.
- **Parser port fidelity** — Browser parsers must produce identical output to CLI parsers. Mitigated by running the existing test fixtures through both paths.
- **Directory picker UX** — Users need to know to navigate to `~/.claude/`. Hidden directories may not appear in the picker on all OS configurations. Mitigated by clear instructions and accepting any directory (scan whatever they point at).
