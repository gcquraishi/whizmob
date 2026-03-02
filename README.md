# whizmob

**You've built more agent systems than you think. Whizmob shows you.**

Whizmob scans your AI tool configs (Claude Code, Cursor, Codex), discovers which agents, skills, and integrations actually work together, and visualizes them as **mobs** — the agent systems you've organically built without realizing it.

## Quick start

```bash
npx whizmob scan
npx whizmob dashboard
```

Open `http://localhost:3333` and see your agent systems laid out as interactive force-directed graphs. Click nodes to inspect components, see how they connect, and understand what you've built.

## What it discovers

Whizmob finds your agents across three platforms:

- **Agents** (`.claude/agents/*.md`, `.cursor/agents/*.md`, `.codex/agents/`)
- **Skills** (`.claude/skills/*/SKILL.md`)
- **MCP servers** (`.claude/.mcp.json`, `.cursor/mcp.json`)
- **Project configs** (`.claude/` directories inside your projects)
- **Settings** (`.claude/settings.json`, `.cursor/settings.json`)

Then it reads each component's source file and detects **edges** — references between components:

- **File path references** — one agent mentions another's config file
- **Skill invocations** — `/skillname` patterns matching known skills
- **Shared state** — multiple components reading the same file

Components with edges cluster into **discovered mobs**. A mob is a group of agents, skills, hooks, and config that work together as a system.

## The Inspector

The dashboard homepage is the **mob inspector** — a master-detail view showing:

- **Left panel**: discovered mobs, ranked by size
- **Top right**: force-directed graph of the selected mob's components and connections
- **Bottom right**: component detail cards (name, type, purpose, invocation, connections)

Click a graph node and the corresponding detail card highlights and scrolls into view.

The full flat inventory lives at `/agents` — every component across all platforms, searchable and filterable.

## Portability

Bundle your mobs and move them between machines:

```bash
# Define a mob
whizmob mob define "my-review-system" \
  --desc "Code review agents and skills" \
  --add code-reviewer test-runner linter

# Export (handles path rewriting, secret stripping, memory bootstrapping)
whizmob export my-review-system

# Import on another machine
whizmob install my-review-system --dry-run   # Preview
whizmob install my-review-system             # Install

# Update after upstream changes
whizmob update my-review-system              # Three-way merge: auto-applies safe changes
whizmob update my-review-system --pull       # Git pull first, then update
```

The update command uses content hashing to classify each file:

- **Upstream-only** changes auto-apply (safe)
- **Local-only** edits are preserved (your customizations)
- **Both-changed** files show a diff (you decide)

## Commands

```bash
# Discovery
whizmob scan                         # Scan all platforms, infer edges
whizmob stats                        # Summary with edge and mob counts

# Inspector
whizmob dashboard                    # Launch web dashboard (localhost:3333)

# Roster (CLI queries)
whizmob roster --search "deploy"     # Search by name or purpose
whizmob roster --hook                # Compact output for SessionStart hook

# Mobs
whizmob mob list                     # List defined mobs
whizmob mob show my-system           # Show mob details
whizmob mob sync ./bundle            # Detect changes vs export

# Portability
whizmob export my-system             # Export as portable bundle
whizmob install <bundle>             # Install a bundle (alias for import)
whizmob update <bundle>              # Smart update with change classification
whizmob install --list               # Show bundled mobs shipped with whizmob

# Translation
whizmob translate my-skill --to gemini dalle midjourney
```

## How it works

Everything is local. No accounts, no server, no API keys.

- **Scanner** reads `~/.claude/`, `~/.cursor/`, and `~/.codex/`
- **Edge inference** reads source files to detect inter-component references
- **Clustering** groups connected components into discovered mobs (BFS on the edge graph)
- **SQLite** at `~/.whizmob/whizmob.db` stores inventory and edges
- **Dashboard** is a local Next.js app at `localhost:3333`
- **Exports** are plain directories with `manifest.json` — git-friendly, no binaries

## Session integration

Inject your agent roster into every Claude Code session:

```bash
# Add whizmob roster hook to your SessionStart hooks
whizmob roster --hook
```

## Requirements

- Node.js 20+
- At least one of: Claude Code, Cursor, or Codex installed

## License

MIT
