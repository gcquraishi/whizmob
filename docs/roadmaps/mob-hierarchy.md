# Whizmob — Mob Hierarchy

## North Star
A power user's agent setup isn't one blob — it's a system of systems. Whizmob discovers, visualizes, and exports hierarchical mobs where sub-mobs share components and the graph tells the story.

## Milestones

### M1: Mob Hierarchy — Complete
- **Why it matters**: The flat mob model collapses 30+ agents into one undifferentiated blob. George's CEO OS is actually 5 workflow groups (daily ops, strategic, execution, maintenance, autonomous) with shared components like `/close` and `/review`. Without hierarchy, the inspector can't show this and the export can't capture it.
- **Acceptance criteria**:
  - [x] `mob_children` table in SQLite: `parent_mob_id`, `child_mob_id`, `display_order`
  - [x] `whizmob mob add-child <parent> <child>` CLI command to nest mobs
  - [x] `whizmob mob show <mob>` displays child mobs and their components
  - [x] A component can belong to multiple mobs (many-to-many preserved — no exclusive membership)
  - [x] `whizmob mob show <parent>` rolls up all components across children (deduplicated)
  - [x] Existing flat mobs continue to work — hierarchy is additive, not breaking
  - [x] Dog-food validation: CEO OS defined with 5 sub-mobs (daily-ops, strategic, execution, maintenance, autonomous), all ~30 skills assigned, re-exported as complete bundle
  - [x] Export of a parent mob includes all children's components (deduplicated)
  - [x] Post-build review passed (CRITICAL: 0, HIGH: 0, MEDIUM: 0)
- **Tickets**: [[WHIZ-28]]
- **Key files**: `src/schema.ts`, `src/mob.ts`, `src/export.ts`, `src/index.ts`

### M2: Graph Clusters — Complete
- **Why it matters**: The graph is where hierarchy becomes visible. Sub-mobs should appear as visually distinct regions — not labeled tree nodes in a sidebar, but spatial clusters in the force-directed layout. This is the "wow" upgrade to the inspector.
- **Acceptance criteria**:
  - [x] Dashboard graph renders sub-mob boundaries as convex hulls or color-coded regions
  - [x] Each sub-mob gets a distinct color/label visible on the graph
  - [x] Shared components (belonging to 2+ sub-mobs) are visually distinct — border treatment, dual-color, or positioned at cluster boundaries
  - [x] Clicking a sub-mob hull/region filters the component detail cards to that sub-mob
  - [x] Left panel mob list shows parent mobs; selecting one loads the hierarchical graph
  - [x] Flat mobs (no children) render exactly as they do today — no regression
  - [x] Demo mode (`whizmob demo`) includes hierarchy visualization
  - [x] Post-build review passed (CRITICAL: 0, HIGH: 0, MEDIUM: 0)
- **Tickets**: [[WHIZ-28]], [[WHIZ-11]]
- **Key files**: `dashboard/components/InspectorGraph.tsx`, `dashboard/app/page.tsx`, `dashboard/lib/db.ts`, `src/demo.ts`

### M3: Sub-Mob Auto-Discovery — Complete
- **Why it matters**: Manual curation (M1) proves the model. Auto-discovery makes it scale. A new user who runs `whizmob scan` should see their workflow groups without defining them by hand. This is the "it just works" moment.
- **Acceptance criteria**:
  - [x] Clustering algorithm detects sub-groups within a connected component (not just connected components themselves)
  - [x] Heuristics: skill invocation chains (A calls B calls C = workflow), shared state files (components reading/writing the same memory.json), hook trigger grouping (SessionStart/Stop hooks + the skills they relate to)
  - [x] Auto-discovered sub-mobs get generated names based on their dominant pattern (e.g., "standup-workflow", "session-hooks")
  - [x] Manual sub-mob definitions (from M1) take precedence over auto-discovered ones
  - [x] `whizmob scan` populates sub-mob hierarchy automatically
  - [x] Quality gate: auto-discovered sub-mobs for George's setup — manual hierarchy (5 sub-mobs) correctly preserved, auto-discovery defers to manual definitions
  - [x] Post-build review passed (CRITICAL: 0, HIGH: 0, MEDIUM: 0)
- **Tickets**: [[WHIZ-28]]
- **Key files**: `src/cluster.ts`, `src/db.ts`, `src/index.ts`

### M4: Granular Export — Not Started
- **Why it matters**: "Just give me your standup workflow" becomes a real command. Instead of exporting 30 skills when someone only wants the daily ops loop, they export a sub-mob. This is what makes hierarchy useful for sharing, not just visualization.
- **Acceptance criteria**:
  - [ ] `whizmob export <mob>` exports a sub-mob (just its components) or a parent mob (full tree, deduplicated)
  - [ ] Manifest includes `hierarchy` field showing the mob tree structure
  - [ ] Import of a sub-mob bundle works independently — no parent mob required
  - [ ] Import of a parent mob bundle creates the full hierarchy on the target machine
  - [ ] Shared components are exported once, referenced from multiple sub-mobs in the manifest
  - [ ] `whizmob import --list` shows hierarchy when present in the bundle
  - [ ] `overview.md` generation reflects the hierarchy (grouped by sub-mob)
- **Tickets**: [[WHIZ-28]]
- **Key files**: `src/export.ts`, `src/import.ts`, `src/index.ts`

## Deferred (explicitly not this roadmap)
- **Cloud sync / hosted registry** — git-based transfer works. Don't build infra for hypothetical users.
- **Gallery / marketplace** — public sharing is a different product.
- **Dashboard mob editor** — CLI curation is sufficient for M1. Dashboard CRUD for hierarchy is a future UX project.
- **Cross-platform hierarchy** — hierarchy within a single platform first. Cross-platform mob nesting (Cursor sub-mob inside a Claude parent) is a later concern.
- **Role labels on components** — (entry point, orchestrator, data store) — good enhancement but orthogonal to hierarchy.

## Dependencies
- M1 is independent — can start immediately
- M2 depends on M1 (needs hierarchy data to visualize)
- M3 depends on M1 (needs the data model to write auto-discovered hierarchy into)
- M4 depends on M1 (needs hierarchy in the data model for the export engine to walk)
- M2, M3, M4 are independent of each other after M1

## Risks
- **Sub-mob auto-discovery quality (M3)** — Finding connected components is easy (BFS). Finding meaningful sub-groups within a connected component is a harder clustering problem. Community detection algorithms (Louvain, label propagation) exist but may be overkill. Start with invocation-chain heuristics and iterate. Manual curation (M1) is the fallback if auto-discovery isn't good enough.
- **Graph rendering complexity (M2)** — Convex hulls around overlapping sub-mobs with shared components is non-trivial. D3 has `d3-hull` but handling overlapping clusters needs care. Consider simpler visual approaches first (background color regions) before committing to proper hull geometry.
- **Export deduplication (M4)** — A component in 3 sub-mobs must be exported once and referenced 3 times. The manifest format needs to handle this cleanly without breaking backward compatibility with flat bundle imports.
