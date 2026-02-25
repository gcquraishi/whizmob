# whizmob

Inventory, port, and manage your AI agents across Claude Code, Cursor, and Codex.

You've built agents, skills, MCP integrations, and project configs across multiple AI tools. whizmob scans your local environment, catalogs everything into a searchable inventory, and lets you bundle agents into portable **constellations** you can move between machines.

## Quick start

```bash
npx whizmob scan
```

That's it. whizmob scans `~/.claude/`, `~/.cursor/`, and `~/.codex/` and shows you what you have:

```
97 items across 3 platforms: 57 agents, 27 skills, 3 mcp servers, 9 project configs, 1 settings.
```

## What it finds

- **Subagents** (`.claude/agents/*.md`, `.cursor/agents/*.md`)
- **Skills** (`.claude/skills/*/SKILL.md`)
- **MCP servers** (`.claude/.mcp.json`, `.cursor/mcp.json`)
- **Project configs** (`.claude/` directories inside your projects)
- **Settings** (`.claude/settings.json`, `.cursor/settings.json`)
- **Codex agents** (`.codex/agents/`)

## Commands

### Inventory

```bash
whizmob scan                    # Scan and import into local DB
whizmob scan --format table     # Human-readable table output
whizmob stats                   # Summary with platform breakdown
whizmob stats -v                # Verbose per-platform counts
whizmob roster --search "deploy" # Search agents by name or purpose
```

### Constellations

A constellation is a named group of agents, skills, hooks, and config that work together as a system. Think: your code review setup, your deployment pipeline, your executive operating system.

```bash
# Define a constellation
whizmob constellation define "my-review-system" \
  --desc "Code review agents and skills" \
  --add code-reviewer test-runner linter

# Add non-passport components (hooks, config files)
whizmob constellation add-component my-review-system ./hooks/pre-commit.sh --type hook

# View it
whizmob constellation show my-review-system
whizmob constellation list
```

### Export & Import

Move constellations between machines. whizmob handles path rewriting, secret stripping, and memory bootstrapping automatically.

```bash
# Export (on source machine)
whizmob export my-review-system
# -> ~/.whizmob/exports/my-review-system/

# Transfer via git, USB, whatever
# ...

# Import (on target machine)
whizmob import ./my-review-system --dry-run  # Preview what will be installed
whizmob import ./my-review-system            # Install it
whizmob import ./my-review-system --force    # Overwrite existing files
```

What export does for you:
- Rewrites absolute paths to `{{HOME}}`, `{{CLAUDE_DIR}}`, `{{WHIZMOB_DIR}}`
- Strips secrets from `.mcp.json` env blocks and any key matching `password|secret|token|key`
- Bootstraps memory files (preserves structure, empties values)
- Flags required MCP servers and npm packages as dependencies

### Sync

Check if source files have changed since you exported:

```bash
whizmob constellation sync ~/.whizmob/exports/my-review-system
```

### Dashboard

Browse your inventory in a web UI:

```bash
whizmob dashboard
# -> http://localhost:3333
```

The dashboard includes:
- Searchable agent inventory (the Yard)
- Agent detail pages (Dossiers) with source viewer and secret redaction
- Constellation management with export/import UI

### Translation

Translate Claude Code skills to other AI platforms:

```bash
whizmob translate my-skill --to gemini dalle midjourney
whizmob translate --list  # Show translatable skills
```

## How it works

whizmob is local-first. Everything stays on your machine:

- **Scanner** reads your `~/.claude/`, `~/.cursor/`, and `~/.codex/` directories
- **SQLite database** at `~/.whizmob/whizmob.db` stores the inventory
- **Dashboard** is a local Next.js app — no server, no accounts
- **Exports** are plain directories with a `manifest.json` — git-friendly, no binaries

## Session integration

whizmob can inject your agent roster into every Claude Code session via a SessionStart hook:

```bash
# Add to your Claude Code hooks config
# The hook outputs a compact roster that Claude sees at session start
whizmob roster --hook
```

## Requirements

- Node.js 20+
- Claude Code, Cursor, or Codex installed (whizmob scans their config directories)

## License

MIT
