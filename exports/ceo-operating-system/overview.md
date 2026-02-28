# CEO Operating System

An executive operating system for solo founders — interactive standup, strategic cofounder, roadmap planning, autonomous sprints, and session lifecycle management across a multi-project portfolio.

## What This Is

The CEO OS is a constellation of 11 components that turn Claude Code into an executive operating partner. Instead of managing projects one at a time, you get a portfolio-level view with automated data collection, interactive decision-making, and autonomous panel delegation.

The system assumes you run multiple projects from a single workspace root, use an Obsidian vault for tickets and notes, and delegate work to project-specific Claude Code panels.

## Components

### Skills (6)

| Skill | What It Does |
|-------|-------------|
| **standup** | Interactive portfolio standup. Collects data from 9 sources (project state, git, panels, memory, tickets, roadmaps, live state, uncommitted work, dump notes), walks you through 3-7 decisions via multiple choice, then generates a daily briefing + panel prompt files. |
| **cofounder** | Strategic thinking partner. Reads live business state, tracks decisions across sessions, challenges your direction, identifies cross-project synergies. Never writes code. Persistent memory across sessions. |
| **roadmap** | Structured planning session. Presents cofounder, product, and CTO perspectives, then co-designs 3-5 outcome-based milestones. Output saved as a named roadmap file. |
| **sprint** | Autonomous roadmap execution. Reads the active roadmap, finds the next unfinished milestone, builds it, updates the roadmap, moves on. Designed to run unattended for 30+ minutes. |
| **debrief** | Session debrief. Reviews the conversation to surface prompt coaching patterns, workflow unlocks, and SOP candidates. Captures institutional memory. |
| **leadership-meeting** | Multi-perspective strategic discussion. Auto-generates agenda from unresolved items, presents cofounder/CTO/product viewpoints, outputs recommended actions with dissenting views. |

### Agents (2)

| Agent | What It Does |
|-------|-------------|
| **chief-of-staff** | Portfolio briefing and delegation planning. Reads all project states, generates prioritized work plans, produces ready-to-paste panel prompts. |
| **sprint-coordinator** | Cross-project sprint planning. Sequences work across projects, identifies dependencies, resolves conflicts between competing priorities. |

### Hooks (2)

| Hook | What It Does |
|------|-------------|
| **panel-start.sh** | SessionStart hook. Writes a JSON status file when a project panel launches, enabling portfolio-level awareness of active sessions. |
| **panel-stop.sh** | Stop hook. Updates the status file when a panel ends, capturing git state (uncommitted changes) for orphan detection. |

### Memory (1)

| Component | What It Does |
|-----------|-------------|
| **memory.json** | Cofounder persistent memory schema. Tracks per-project decisions, follow-ups, notes, and people across sessions. Bootstrapped empty on import — fills up as you use /cofounder. |

## How It Works Day-to-Day

1. **Start a session**: Run `/standup` from your root workspace. It asks what's on your mind, collects portfolio data silently, walks you through prioritization decisions, then generates a daily briefing (syncs to your phone via Obsidian) and panel prompt files.

2. **Delegate to panels**: Open project-specific terminal panels. Paste the generated panel prompts. Each prompt is self-contained — the panel works autonomously for 30+ minutes.

3. **Sprint through roadmaps**: In a project panel, run `/sprint`. It reads the active roadmap and works through milestones without intervention.

4. **Think strategically**: Run `/cofounder` when you need to think at the business level — pricing, positioning, cross-project synergies. It remembers decisions across sessions.

5. **Close sessions**: Run `/close` (not part of this bundle — project-level) to validate state updates and commit changes. Run `/debrief` first if the session produced insights worth capturing.

## Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `OWNER_NAME` | Your name (used in agent prompts) | `George` |
| `ORG_NAME` | Your organization name | `Big Heavy LLC` |
| `WORKSPACE_ROOT` | Root directory containing all projects | `~/Documents/big-heavy` |
| `VAULT_PATH` | Obsidian vault path for tickets and notes | `~/Documents/brain` |
| `PANEL_REGISTRY_DIR` | Where panel status JSON files are stored | `~/.big-heavy-panels` |

## Install

```bash
npx whizmob import ceo-operating-system \
  --param '{{OWNER_NAME}}=YourName' \
  --param '{{ORG_NAME}}=YourOrg' \
  --param '{{WORKSPACE_ROOT}}=~/Documents/your-workspace' \
  --param '{{VAULT_PATH}}=~/Documents/your-vault' \
  --param '{{PANEL_REGISTRY_DIR}}=~/.your-org-panels'
```

## Changelog

- **v3** (2026-02-27): Full content parameterization. All hardcoded org references replaced with `{{PARAM}}` tokens. Org-specific CLAUDE.md removed from bundle.
- **v2** (2026-02-26): Memory schema update.
- **v1** (2026-02-25): Initial export — 11 components, all skills and agents bundled.
