# Whizmob — Mob Inspector

## North Star
Run `whizmob scan`, open the dashboard, and instantly see your agent systems — not a flat list of 97 components, but the mobs you've organically built, visualized as interconnected graphs. Install and update mobs across machines via CLI. Share your setup publicly from a clean `whizmob` repo.

## Milestones

### M1: Edge Inference Engine — Complete
- **Why it matters**: Without edges, there are no mobs — just a bag of disconnected components. Edge inference is the foundation for everything: discovery, visualization, clustering. It transforms the scanner from "find files" to "understand systems."
- **Acceptance criteria**:
  - [x] Scanner reads each component's file content and detects references to other known components
  - [x] Edge types detected: file path references (`~/.claude/cofounder/memory.json`), skill invocations (`/standup`, `/roadmap`), hook trigger patterns (`SessionStart`), shared state (multiple components reading/writing the same file)
  - [x] Edges stored in a new `edges` table in SQLite with `source_id`, `target_id`, `edge_type`, `evidence` (the matched text)
  - [x] `whizmob scan` populates edges automatically alongside passports (no separate command)
  - [x] Edge inference runs on all platforms (Claude Code, Cursor, Codex) — same heuristics, platform-aware path normalization
  - [x] 208 edges detected in George's environment, connecting 31 of 103 passports (45 invocations, 163 references)
  - [x] Edge data available via new API route for the dashboard (`GET /api/edges`)
  - [x] Post-build review passed (CRITICAL: 0, HIGH: 0, MEDIUM: 0)
- **Tickets**: [[WHIZ-23]]
- **Key files**: `src/edges.ts`, `src/schema.ts`, `src/db.ts`, `tests/edges.test.ts`, `dashboard/app/api/edges/route.ts`

### M2: Mob Inspector — Not Started
- **Why it matters**: This is the product's "wow" moment. A user who runs `whizmob scan` and opens the dashboard should immediately understand what agent systems they've built — not scroll through a flat inventory. The inspector makes the invisible visible.
- **Acceptance criteria**:
  - [ ] Connectivity-based clustering groups tightly-connected components into discovered mobs
  - [ ] Dashboard homepage (`/`) is the mob inspector: master-detail layout with mob list (left), per-mob force-directed graph (top right), linked component detail cards (bottom right)
  - [ ] Clicking a graph node scrolls to and highlights the corresponding component detail card
  - [ ] Component detail cards show: name + type badge, description, invocation command (if applicable), file path, cross-mob links ("Also in: [X]"), last modified
  - [ ] Standalone components (islands) don't appear in the inspector — they live at `/agents`
  - [ ] Current inventory view moves to `/agents` (flat searchable catalog of all components)
  - [ ] Old `/constellations` and `/mobs` routes redirect appropriately
  - [ ] First-run experience: if no mobs discovered, show inventory with messaging ("No agent systems detected. Your N agents appear to be standalone.")
  - [ ] Nav updated: "Inspector" (→ /), "Inventory" (→ /agents), "Import" (→ /mobs/import)
- **Tickets**: [[WHIZ-24]], [[WHIZ-25]], [[WHIZ-26]], [[WHIZ-27]]
- **Key files**: `dashboard/app/page.tsx`, `dashboard/components/MobGraph.tsx` (rearchitect), `dashboard/app/agents/` (new), `dashboard/lib/db.ts`

### M3: Smart Update — Not Started
- **Why it matters**: "I discovered an unlock on personal, now I want it on work" should be one command. The CLI install/update pipeline is what makes mobs portable, not just visible.
- **Acceptance criteria**:
  - [ ] `whizmob update <bundle>` command: load import profile → classify changes → apply safe ones → surface ambiguous ones
  - [ ] Three-way classification for each file:
    - **Parameter-only divergence**: local differs from bundle only due to `{{PARAM}}` substitutions → safe to overwrite with new upstream + re-substitute
    - **Upstream-only**: local unchanged since last import, upstream changed → auto-apply
    - **Both-changed**: local edits AND upstream edits → show diff, ask user
  - [ ] Import-time content hashing: store hash of pre-substitution bundle content in profile. On update, compare hash to detect real edits vs. param-only divergence.
  - [ ] If bundle is a git repo path, `--pull` flag runs `git pull` before syncing
  - [ ] End-to-end: edit a skill → re-export → `whizmob update` on another machine → param-only and upstream-only changes apply automatically, both-changed files show a clear diff
  - [ ] `whizmob install <bundle>` as alias for `whizmob import` (friendlier verb for new users)
- **Tickets**: Carries forward from cross-account-portability M3
- **Key files**: `src/sync.ts`, `src/import.ts`, `src/index.ts`

### M4: Public Launch — Not Started
- **Why it matters**: Whizmob can't grow beyond George if nobody can find it. A public repo with the inspector narrative positions whizmob as "the tool for understanding your AI agent systems" — not just another CLI utility.
- **Acceptance criteria**:
  - [ ] Public GitHub repo named `whizmob` (dev repo renamed to `whiz-mob`)
  - [ ] Git history scrubbed: `seed-inventory.json` and `dashboard/data/whizmob.db` removed from all commits
  - [ ] README rewritten around the inspector narrative: "You've built more agent systems than you think. Whizmob shows you."
  - [ ] `npx whizmob scan` works from the public repo — zero-config first run
  - [ ] Demo mode (read-only dashboard sharing) so George can show the inspector to others without exposing auth
  - [ ] npm package updated to point at the public repo
  - [ ] At least one screenshot/GIF of the mob inspector in the README
- **Tickets**: [[WHIZ-10]], [[WHIZ-4]]
- **Key files**: `README.md`, `package.json`, GitHub repo settings

## Deferred (explicitly not this roadmap)
- **Cloud sync / hosted registry** — git-based transfer works for the current scale. Don't build infra for hypothetical users.
- **Gallery / marketplace** — public sharing is a different product. This roadmap is about understanding and porting *your* agent systems.
- **Translation validation** — compelling demo but orthogonal to the inspector vision.
- **Reverse flow (work → personal)** — validates bidirectional portability but depends on M3 + work machine access. Revisit after M3.
- **Manual mob creation in dashboard** — CLI `whizmob mob define` coexists with auto-discovery, but dashboard UI for mob management is out of scope for MVP.
- **Role labels on components** — (entry point, orchestrator, data store) — good future enhancement for the inspector, not MVP.

## Dependencies
- M1 is independent — can start immediately
- M2 depends on M1 (edges are the input to clustering)
- M3 is independent of M1/M2 (pure CLI work on the import/sync pipeline)
- M4 depends on M2 (inspector must exist before the public narrative makes sense) and requires George to create the GitHub account/org

## Risks
- **Edge inference quality** — if heuristics produce bad clusters, the inspector is useless. Mitigation: start with high-confidence edge types (file path refs, `/skill` invocations) and iterate. Log unmatched references for tuning.
- **Work machine access keeps slipping** — M3 can be built and tested locally with synthetic profiles. Don't let the work machine block CLI development.
- **Git history scrubbing** — BFG or `git filter-repo` on a repo with dashboard assets and DB snapshots. Test on a branch first. Risk of breaking npm publish references.
- **Inspector UX complexity** — master-detail + graph + scroll-linked detail is ambitious for a Next.js dashboard. The existing `MobGraph.tsx` is a starting point but needs significant rework. Consider shipping a simpler version first (mob list + detail page, no split pane) and iterating.
