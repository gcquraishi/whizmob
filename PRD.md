# Project Ronin — MVP PRD
## Agent Inventory for Claude Code Users

**Version:** 0.1
**Date:** 2026-02-14
**Author:** George Quraishi
**Status:** Draft

---

## 1. Problem Statement

Knowledge workers using Claude Code are building increasingly sophisticated agent ecosystems — subagents, skills, MCP integrations, project-level configurations — with no way to see, search, or manage them as a portfolio. These agents are defined as markdown files scattered across `~/.claude/` and project directories, invisible to anyone without terminal access.

As agent counts grow (George's own setup: 36 agents across 7 projects), the problems compound:
- **No visibility:** Which agents exist? What do they do? Are any redundant?
- **No sharing:** Colleagues can't browse or fork your agents without copying files manually.
- **No versioning insight:** When did this agent last change? What's its lineage?
- **No cross-project view:** An agent built for Fictotum might be useful in Quraishi HQ, but you'd never know.

## 2. Target User

**Primary:** Individual Claude Code power users who have built 5+ agents/skills.
**Profile:** Technical PM or developer who "vibe-codes" agents via conversation, then refines them into reusable tools. Uses Claude Code daily across multiple projects.
**Initial market size:** Thousands and growing rapidly as Claude Code adoption accelerates.

**Secondary (future):** Teams sharing agent libraries within a company.

## 3. Solution — The Agent Audit

A CLI scanner + web dashboard that automatically discovers and catalogs every agent, skill, MCP integration, and project configuration in a Claude Code user's environment.

### 3.1 Core Principle

**Zero manual entry.** The tool scans your filesystem and shows you what you have. If it requires the user to type in agent details, we've failed.

### 3.2 What Gets Scanned

| Source | Location | What We Extract |
|--------|----------|----------------|
| Subagents | `~/.claude/agents/*.md` | Name, description, model hint, purpose (from YAML frontmatter + first paragraph) |
| Skills | `~/.claude/skills/*/SKILL.md` | Name, description, invocation command, capabilities |
| Project configs | `**/.claude/projects/*/` | Project name, session count, memory files |
| Project instructions | `**/CLAUDE.md` | Project purpose, tech stack, key decisions |
| MCP servers | `**/.mcp.json` | Server name, command, purpose |
| Settings | `~/.claude/settings.json` | Default model, permissions mode |

### 3.3 Output Format — The Proto-Passport

Each discovered agent is normalized into a consistent JSON schema:

```json
{
  "id": "agent-backend-engineer",
  "name": "Backend Engineer",
  "type": "subagent | skill | mcp | project",
  "platform": "claude-code",
  "scope": "user | project",
  "purpose": "string",
  "model_hint": "opus | sonnet | haiku | null",
  "invocation": "/command-name | null",
  "status": "active | draft | archived",
  "tags": ["string"],
  "source_file": "path",
  "metadata": {}
}
```

This schema is deliberately extensible. The `metadata` field is where future Passport fields (persona, constraints, capabilities, compiled_prompts) will grow.

## 4. Components

### 4.1 The Scanner (CLI)

**What it is:** A Node.js script that scans the Claude Code filesystem and outputs a JSON inventory.

**Usage:**
```bash
npx ronin scan                    # Scan and output to stdout
npx ronin scan --output inventory.json  # Save to file
npx ronin scan --format table     # Pretty-print as table
```

**Behavior:**
1. Scan `~/.claude/agents/` for all `.md` files. Parse YAML frontmatter for name, description, model. Extract first paragraph as purpose.
2. Scan `~/.claude/skills/` for all `SKILL.md` files. Same parsing.
3. Walk the working directory tree (configurable root, default `~/Documents`) for `CLAUDE.md` and `.mcp.json` files. Depth-limited to avoid scanning node_modules, .git, etc.
4. Read `~/.claude/settings.json` for global config.
5. Count sessions per project from `~/.claude/projects/*/` directory contents.
6. Normalize everything into Proto-Passport format.
7. Output as JSON, table, or push to Ronin dashboard.

**Constraints:**
- Must complete in < 5 seconds for a typical setup (< 100 agents, < 20 projects).
- Must not read file contents beyond frontmatter + first paragraph (privacy-safe by default).
- Must handle missing/malformed files gracefully (skip and warn, don't crash).

### 4.2 The Dashboard (Web)

**What it is:** A Next.js web app where users view, search, tag, and manage their agent inventory.

**Core screens:**

#### Home — The Yard
- Card grid of all agents, grouped by type (subagents, skills, MCP, projects).
- Each card: name, type icon, purpose (one line), tags, model badge.
- Search bar with instant filtering by name, purpose, or tag.
- Sort by: name, type, last modified, project.
- Summary stats at top: total agents, by type, by project.

#### Agent Detail — The Dossier
- Full agent info: name, purpose, description, model, invocation, tags.
- Source file path (clickable to open in editor).
- Raw markdown preview of the agent definition.
- Project associations (which projects use this agent).
- Edit tags (stored in Ronin, not in the source file).

#### Import / Sync
- "Scan Now" button that triggers the CLI scanner.
- Shows diff: new agents found, agents removed since last scan.
- Last scan timestamp.

### 4.3 Onboarding Prompt (for non-automated platforms)

For agents on OpenAI, Gemini, or Claude.ai (web) that can't be auto-scanned, provide a structured prompt users can paste into those platforms:

```
List all custom agents/GPTs/Gems/Projects you have access to.
For each one, provide:
- Name
- Platform (OpenAI GPT / Gemini Gem / Claude Project)
- Purpose (one sentence)
- Status (actively used / occasionally / dormant)
- Approximate creation date

Format as JSON array.
```

The user pastes the output into Ronin's "Manual Import" field. Ronin parses it into Proto-Passports.

## 5. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Scanner | Node.js + TypeScript | Matches Claude Code ecosystem. Can be npx-distributed. |
| Web App | Next.js 15 (App Router) | George knows it. Fast to ship. |
| Styling | Tailwind CSS | George knows it. |
| Database | SQLite (local-first) | No account required for v1. Data stays on user's machine. |
| Auth | None (v1) | Local-first. No server. |
| Hosting | None (v1) — runs locally | `npx ronin dashboard` starts a local server. |

### Why Local-First?

1. **Privacy:** Agent definitions may contain sensitive business logic. Sending them to a server is a non-starter for many users.
2. **Zero friction:** No signup, no account, no API keys. Just run the command.
3. **Aligns with Claude Code's model:** Claude Code itself is a CLI tool. Its users are comfortable with terminal-first workflows.
4. **Migration path:** When we add cloud sync (for teams, sharing, Gallery), the local-first data model becomes the source of truth that syncs up, not the other way around.

## 6. Non-Goals (v1)

- Agent translation/compilation across models
- Agent sharing or marketplace
- IP licensing or scrubbing
- MCP-based deployment to other platforms
- AI-powered agent creation or editing
- Cloud storage or user accounts
- Support for non-Claude-Code platforms (auto-scan)

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first inventory | < 60 seconds from install | `time npx ronin scan` |
| Agents discovered | > 90% of actual agents | Compare scan output to manual count |
| User return rate | User runs scan again within 7 days | Local telemetry (opt-in) |
| Word of mouth | 3+ people ask "how do I get this?" after seeing George's | Social signal |

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude Code changes filesystem conventions | Medium | High | Pin to known paths, version the scanner, watch Claude Code changelogs |
| Users don't have enough agents to care | Medium | High | Target power users explicitly. If < 5 agents, show "you're just getting started" and suggest templates |
| Local-first limits network effects | Low (v1) | Medium | Intentional for v1. Cloud sync is the v2 upgrade path |
| Parsing YAML frontmatter is fragile | Medium | Low | Graceful fallback: if parsing fails, use filename as name and "Unknown" as purpose |

## 9. Milestones

### M1: Scanner (1-2 sessions)
- [ ] Parse `~/.claude/agents/*.md` — extract frontmatter + purpose
- [ ] Parse `~/.claude/skills/*/SKILL.md` — extract frontmatter + invocation
- [ ] Discover CLAUDE.md and .mcp.json files
- [ ] Output Proto-Passport JSON
- [ ] Pretty-print table format
- [ ] Handle edge cases (missing files, malformed YAML, empty dirs)

### M2: Dashboard (2-3 sessions)
- [ ] Next.js app with Yard view (card grid)
- [ ] Search and filter
- [ ] Agent detail view (Dossier)
- [ ] "Scan Now" trigger from dashboard
- [ ] SQLite local persistence
- [ ] Manual import for non-Claude-Code agents

### M3: Dog-food & Polish (1 session)
- [ ] George catalogs full agent library
- [ ] Fix friction points discovered during dog-fooding
- [ ] README and install instructions
- [ ] Record demo for social proof

### M4: Distribution (1 session)
- [ ] npm package published (`npx ronin scan`)
- [ ] Post to Claude Code community, Twitter/X, relevant Discords
- [ ] Collect feedback

## 10. Future (Post-MVP)

In priority order, based on what we learn from v1:

1. **Cloud sync + accounts** — Share your inventory, access from anywhere
2. **Team Yards** — Company-wide agent libraries with role-based access
3. **Tuning Engine** — Platform-specific optimization (the compiler)
4. **MCP deployment** — Deploy Ronin agents to Claude Desktop, Cursor, etc.
5. **Gallery** — Public agent marketplace with forking and licensing
6. **Cross-platform scan** — OpenAI API, Gemini API auto-discovery (when APIs exist)
