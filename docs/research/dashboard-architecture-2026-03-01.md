# Whizmob Dashboard Architecture — 2026-03-01

## Applicable To
- **Projects**: whizmob
- **Products/Features**: Dashboard UI, scanner inference engine, mob discovery
- **Why relevant**: Defines the site architecture, UX model, and discovery pipeline for the whizmob dashboard going forward

## Product Model

Whizmob's dashboard is a **system inspector** — it discovers and visualizes how agent systems work together. The primary object is the **mob** (auto-discovered via connectivity-based clustering of the scanner's inferred dependency graph). Individual components (passports) are secondary, browsable in a separate inventory view.

### Key Principles
- **Discovery over creation**: The scanner infers mobs from how components reference each other. Users don't define mobs in the dashboard (CLI manual definition coexists eventually, out of scope for MVP).
- **Mobs are emergent**: A mob is a cluster of tightly-connected components that the scanner finds by reading file content and detecting cross-references (file paths, skill invocations, shared memory, hook triggers).
- **Graph + detail linked browsing**: Clicking a node in the mob graph scrolls to and highlights the corresponding component detail card below.
- **Islands go to inventory**: Standalone components with no detected connections don't appear in the inspector — they live in the flat inventory at `/agents`.

## Discovery Pipeline

```
Phase 1: Scan         Phase 2: Infer Edges      Phase 3: Cluster        Phase 4: Visualize
────────────────  →  ────────────────────  →  ────────────────────  →  ────────────────
Find all agents,     Read file content,        Connectivity-based       Render per-mob
skills, hooks,       detect references to      graph clustering.        force-directed
configs, MCP         other components:         Tightly connected        graph + linked
                     file paths, skill         components become        component detail
                     names, invocations,       discovered mobs.         panel.
                     shared memory paths,      Islands = ungrouped.
                     hook triggers.
```

### Edge Inference (Phase 2)

The scanner reads each component's file content and detects references to other known components:
- **File path references**: `~/.claude/cofounder/memory.json` in a skill file → edge to the memory component
- **Skill invocation patterns**: `/standup` referenced in a file → edge to the standup skill
- **Hook triggers**: `SessionStart` hook writes to a path that another component reads → data flow edge
- **Shared state**: Multiple components reading/writing the same file (e.g., `memory.json`) → shared state edges

Edge types: `reads`, `writes`, `invokes`, `triggers` (v1 may simplify to just `references` if type detection is unreliable).

### Connectivity Clustering (Phase 3)

Why connectivity-based over directory-anchored:
- Components in `~/.claude/` are organized by **type** (agents/, skills/, hooks/) not by **system**
- Directory clustering creates giant bags of unrelated components
- Connectivity clustering correctly discovers systems like the CEO Operating System that span agents/ + skills/ + csuite/

Example from George's environment:
- **CEO Operating System** (12 components): standup, sprint, debrief, roadmap, close, cofounder agent, chief-of-staff, cofounder skill, panel-start.sh, panel-stop.sh, memory.json, CLAUDE.md patterns
- **Whizmob Roster** (2 components): roster skill, roster-inject.sh
- **Islands** (15+ components): backend-engineer, frontend-engineer, data-architect, explore, execute, review, etc. — standalone utilities with no detected dependencies

## Sitemap

| Route | View | Purpose |
|---|---|---|
| `/` | Mob Inspector | Master-detail: mob list (left) + per-mob graph (top right) + linked component detail (bottom right) |
| `/mobs/[id]` | Deep-link | Selects a specific mob in the inspector |
| `/agents` | Component Inventory | Flat searchable catalog (today's Yard). All components, including islands. |
| `/agents/[id]` | Component Detail | Full detail for a single component (today's Dossier) |
| `/mobs/import` | Import | Import a mob bundle |
| `/translate` | Translation | Demo/utility page (low priority, static) |

### Navigation
- Top nav: Whizmob wordmark, "Inspector" (→ /), "Inventory" (→ /agents), "Import" (→ /mobs/import)
- Translation link demoted or removed from nav

## Inspector Layout (Homepage)

```
┌─────────────┬──────────────────────────────────────────┐
│             │                                          │
│  Mob List   │   Mob Graph (force-directed, this mob)   │
│             │                                          │
│  ● CEO OS   │   [cofounder]──[memory]──[standup]       │
│    Roster   │        │                    │             │
│             │     [hooks]──────────[sprint]             │
│             │                                          │
│             ├──────────────────────────────────────────┤
│             │                                          │
│             │   Component Detail (scroll-linked)       │
│             │                                          │
│             │   ┌ cofounder ─────────────────────────┐ │
│             │   │ Subagent · ~/.claude/agents/co...   │ │
│             │   │ Strategic thinking partner, never   │ │
│             │   │ writes code. Persistent memory.     │ │
│             │   │ Also in: [Work OS]                  │ │
│             │   └────────────────────────────────────┘ │
│             │   ┌ standup ──────────────────────────┐  │
│             │   │ Skill · /standup                    │ │
│             │   │ Interactive portfolio standup...     │ │
│             │   └────────────────────────────────────┘ │
└─────────────┴──────────────────────────────────────────┘
```

### Component Detail Card Fields

| Field | Question it answers | Notes |
|---|---|---|
| Name + type badge | What is it? | Subagent/skill/hook/mcp/config/memory_schema, color-coded |
| Description | What does it do? | `purpose` from passport, or first line of file |
| Invocation command | How do I use it? | `/standup`, hook trigger event. Conditional — not all types have invocations. |
| File path | Where does it live? | Truncated (hide `~/.claude/` prefix, show meaningful tail) |
| Cross-mob links | What else uses it? | "Also in: [Work OS], [Debug Kit]" — shows shared infrastructure |
| Last modified | Is it stale? | Lightweight freshness signal from filesystem |

### Graph Interaction
- Click node → scroll detail panel to that component's card, highlight it
- Drag to reposition nodes
- Hover for tooltip (name + type)
- Click mob in left panel → load that mob's graph + components
- Edge labels or line styles distinguish edge types (reads/writes/invokes)
- Shared-component nodes get a visual indicator (badge, outline) showing cross-mob membership

## First-Run Experience

- No mobs discovered (all islands) → show component inventory as fallback with messaging: "No agent systems detected. Your N agents appear to be standalone."
- Mobs discovered → go straight to the inspector, first mob selected

## Out of Scope (MVP)

- Mob creation/editing in the dashboard UI (CLI only for now)
- Writing back to ~/.claude/ from the dashboard
- Interactive onboarding wizard
- Role labels on components (entry point, orchestrator, etc.) — good idea, deferred
- Manual mob coexistence with auto-discovered mobs (eventually yes, not MVP)

## Decisions Made

1. **Primary object is the mob, not the passport** — dashboard is a system inspector, not an inventory browser
2. **Discovery over creation** — scanner infers mobs from file content analysis, users don't create mobs in UI
3. **Connectivity-based clustering** — directory-anchored fails because `~/.claude/` organizes by type not by system
4. **Edge inference from file content** — scanner reads files, detects references to other components, builds dependency graph
5. **Graph ↔ detail linked** — clicking a graph node scrolls to and highlights the component detail card
6. **Islands in inventory only** — standalone components don't appear in the mob inspector, only in /agents
7. **Yard demoted to /agents** — flat inventory moves from homepage to secondary route
8. **Manually-defined mobs coexist eventually** — but out of scope for MVP, which focuses on discovery
