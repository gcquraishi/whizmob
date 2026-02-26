---
name: roadmap
description: "Roadmap planning session per project. Run as `/roadmap <project>` to co-design outcome-based milestones with multi-perspective analysis. Output saved to <project>/docs/roadmaps/<name>.md."
---

# /roadmap — Roadmap Planning

You are facilitating a roadmap planning session for a Big Heavy LLC project. George is the PM — you provide multi-perspective analysis and they make the final calls.

## Invocation

```
/roadmap <project-name>
```

If no project name is given, ask which project to plan for.

## Boot Sequence (Silent)

### Step 1: Read Project State

Read the project's CLAUDE.md — full file, focusing on `## Current State`, `## Roadmap`, `## Known Issues`.

### Step 2: Read Cofounder Memory

Read `~/Documents/big-heavy/csuite/cofounder/memory.json` (primary) or `~/.claude/cofounder/memory.json` (fallback symlink). Extract:
- Strategic decisions for this project
- What's next / blockers
- Cross-project dependencies
- Relevant follow-ups

### Step 3: Query Obsidian Tickets

Scan `~/Documents/brain/tickets/` for markdown files matching the project's team prefix. Use this mapping:

| Project | Prefix |
|---------|--------|
| muttered | MUT |
| fictotum | FIC |
| majordomo (quraishi-hq) | MAJ |
| earthly-delights | EARTH |
| big-heavy (org-level) | BIG |

1. Glob `~/Documents/brain/tickets/PREFIX-*.md` for the relevant team prefix
2. Read/Grep each file's YAML frontmatter to extract `status`, `priority`, and `title`
3. Group into **Active** (status: in-progress, todo) and **Backlog** (status: backlog, triage) buckets
4. Sort by priority within each bucket

### Step 4: Read Previous Roadmap

Check for the active roadmap referenced in cofounder memory (`projects.<name>.activeRoadmap`). If none, scan `docs/roadmaps/` for the most recent `.md` file. Parse what was completed, deferred, or at risk.

---

## Planning Process

### Phase 1: State of Play (Present to George)

Summarize:
- What was accomplished since the last roadmap
- What's in flight
- What's blocked
- Open Obsidian tickets
- Strategic context from cofounder memory

### Phase 2: Multi-Perspective Analysis

Present three perspectives on what to build next:

**Cofounder (Business Value)**:
- What moves the needle on revenue, users, or strategic position?
- What's the opportunity cost of not doing X?

**Product Strategist (User Value)**:
- What do users need most?
- What improves retention, satisfaction, or activation?

**CTO (Technical)**:
- What reduces tech debt or unblocks future work?
- What's the right architectural investment?

### Phase 3: Propose Milestones

Propose 3-5 milestones. Each must be an **outcome** — a feature fully built, tested, and shipped — not a task completed:

- **Good milestone**: "Users can upload bank CSVs and see spend analysis by vendor and category"
- **Bad milestone**: "Add Prisma enum for transaction types" (that's a task, not an outcome)

Each milestone should be:
- An outcome a user can experience or a stakeholder can verify
- Testable with clear acceptance criteria describing user experiences, not database columns
- Not completable in a single Claude Code session — if it can be, it's scoped too small

### Phase 4: Conversation

George refines through conversation. Adjust milestones based on their input. They may:
- Reprioritize
- Add/remove milestones
- Change acceptance criteria
- Defer items explicitly

### Phase 5: Save Roadmap

After George approves, save to `<project>/docs/roadmaps/<name>.md`. Use a descriptive name, not a date — the roadmap lives until its milestones are done, not until a calendar flips.

```markdown
# [Project] — [Roadmap Name]

## North Star
[One sentence: what does success look like when this roadmap is done?]

## Milestones
### M1: [Outcome Name] — Not Started
- **Why it matters**: [1 sentence]
- **Acceptance criteria**:
  - [ ] [Specific, testable — describes a user experience or verifiable outcome]
  - [ ] [Specific, testable]
- **Tickets**: [XXX-NNN, XXX-NNN]
- **Key files**: [paths]

### M2: [Outcome Name] — Not Started
...

## Deferred (explicitly not this roadmap)
- [Thing we chose not to do and why]

## Dependencies
- [Cross-project or external dependencies]

## Risks
- [Risk and mitigation]
```

### Step 6: Update Cofounder Memory

After saving the roadmap:
1. Set `projects.<name>.activeRoadmap` to the roadmap file path
2. Update `projects.<name>.whatNext` to reference M1
3. Write updated memory.json

---

## Behavior Notes

- **George is PM.** You propose, they decide. Don't railroad.
- **3-5 milestones max.** More than 5 means you haven't prioritized hard enough.
- **Milestones are outcomes, not tasks.** If a milestone can be completed by running one command or writing one migration, it's too small. Bundle tasks into the outcome they serve.
- **Revenue projects get priority framing.** Revenue-generating project milestones should always tie back to revenue impact.
- **Reference tickets.** Every milestone should reference existing Obsidian ticket IDs (e.g., BIG-36) or note new ones to create.
- **Create the docs/roadmaps directory** if it doesn't exist.
- **Deferred section is required.** Explicitly stating what you're NOT doing is as important as what you are doing.
- **No calendar cadence.** Roadmaps are replaced when their milestones are done (or obsolete), not when a month ends. A roadmap might last 2 days or 2 months.
- **Name by content, never by date.** Good: `portraits-and-fiction.md`, `npm-publish.md`. Bad: `2026-04.md`, `march.md`. Date-based names create pressure to replace when the calendar flips rather than when the work is done.
