# whizmob

**You've built more agent systems than you think. Whizmob shows you.**

Whizmob scans your AI tool configs (Claude Code, Cursor, Codex), discovers which agents, skills, and integrations actually work together, and visualizes them as **mobs** — the agent systems you've organically built without realizing it.

## Quick start

```bash
npx whizmob scan          # Discover your agents (30 seconds)
npx whizmob demo --open   # See them as an interactive graph in your browser
```

That's it. No accounts, no API keys, no config.

### Sample output

```
[whizmob] DB updated: 42 total, +42 added, -0 removed
[whizmob] New: code-reviewer, test-runner, deploy-agent, standup, roadmap, ...
[whizmob] Edges: 67 inferred
[whizmob] Hierarchy: 3 sub-mobs discovered across 1 mobs

[whizmob] Found 42 components across 2 platforms.

  What's next:
    whizmob demo --open    Open an interactive mob inspector in your browser
    whizmob dashboard      Launch the full dashboard at localhost:3333
    whizmob stats          Quick inventory summary
    whizmob roster -s <q>  Search your agents by name or purpose
```

Want the full dashboard instead? Run `npx whizmob dashboard` and open `http://localhost:3333`.

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

<p align="center">
  <img src="docs/inspector-preview.svg" alt="Whizmob Mob Inspector — three-panel layout showing discovered mobs, force-directed graph, and component detail cards" width="720" />
</p>

The dashboard homepage is the **mob inspector** — a master-detail view showing:

- **Left panel**: discovered mobs, ranked by size
- **Top right**: force-directed graph of the selected mob's components and connections
- **Bottom right**: component detail cards (name, type, purpose, invocation, connections)

Click a graph node and the corresponding detail card highlights and scrolls into view.

The full flat inventory lives at `/agents` — every component across all platforms, searchable and filterable.

Share the inspector without requiring a local install:

```bash
whizmob demo          # Generate standalone HTML preview
whizmob demo --open   # Generate and open in browser
```

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
whizmob demo                         # Generate shareable HTML preview
whizmob demo --open                  # Generate and open in browser

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
- **macOS**: Xcode command-line tools (`xcode-select --install`) — needed to compile the native SQLite module
- **Linux**: `build-essential` and `python3` packages

## License

MIT
