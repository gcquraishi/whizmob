---
name: sprint
description: "Read the active roadmap and autonomously work through milestones. Finds the next unfinished milestone, builds it, updates the roadmap, and moves on."
---

# /sprint — Autonomous Roadmap Execution

You are autonomously executing a project's roadmap. Read the roadmap, find the next unfinished milestone, build it, verify it, update the roadmap, and move to the next one. No manual handoffs — you drive until everything is done or blocked.

## Boot Sequence (Silent)

Run all of these silently. Do NOT narrate the data collection — just begin working.

### Step 1: Read Project CLAUDE.md

Read the project's `CLAUDE.md` in the current working directory. Extract:
- `## Current State` — what's already done, what's in flight, known issues
- `## Conventions` — coding patterns, safety rules, naming conventions
- `## Protocols` — ingestion rules, entity resolution, provenance requirements
- `## Roadmap` — immediate priorities and active work

### Step 2: Find the Active Roadmap

Locate the active roadmap:
1. Check cofounder memory (`{{WORKSPACE_ROOT}}/{{MEMORY_PATH}}`) for `projects.<name>.activeRoadmap`
2. If not found, scan `docs/roadmaps/` for the most recent `.md` file
3. If no roadmap exists, stop and tell the user: "No roadmap found. Run `/roadmap` first."

### Step 3: Parse Milestones

Read the roadmap file. For each milestone (`### M1:`, `### M2:`, etc.), extract:
- **Name** and **status** (from the header: "Not Started", "In Progress", "Complete", "Blocked")
- **Acceptance criteria** (checkbox items)
- **Linear tickets** referenced
- **Key files** listed
- **Dependencies** on other milestones

### Step 4: Identify Next Milestone

Find the first milestone that is "Not Started" or "In Progress", respecting dependencies:
- Skip milestones marked "Complete" or "Blocked"
- If a milestone depends on another that isn't complete, skip it too
- If ALL remaining milestones are blocked or complete, proceed to session close

### Step 5: Read Relevant Code

Before starting work, read the files listed in the milestone's "Key files" section and any files referenced in its acceptance criteria. Understand the current state of the code you'll be modifying.

---

## Execution Loop

For each milestone (sequential):

### 1. Explore

- Read all key files and surrounding code
- Understand existing patterns and conventions
- Identify what needs to change to satisfy each acceptance criterion
- If the milestone references Linear tickets, note their context but don't query Linear — the roadmap has the specs

### 2. Build

- Implement the work required to satisfy each acceptance criterion
- Follow the project's existing code patterns and conventions from CLAUDE.md
- Commit incrementally with descriptive messages after each logical unit of work
- Do NOT batch everything into one big commit at the end

### 3. Review

After building a milestone, run a `/review` pass on the files you modified:

1. Collect all files changed since the milestone began (use `git diff --name-only` against the commit before you started)
2. Run the `/review` checklist (security, error handling, TypeScript quality, production readiness, React patterns, performance, architecture) scoped to those files only
3. Fix any CRITICAL or HIGH findings before proceeding — these block milestone completion
4. Note MEDIUM findings in the roadmap milestone as a follow-up line (don't block on them)
5. After fixes, commit with a message like `review: fix [issue] in [file]`
6. Record the review in the roadmap milestone by appending: `- [x] Post-build review passed (CRITICAL: 0, HIGH: 0, MEDIUM: N)`

This is a lightweight, focused review — not a full `/review` invocation. Scope is strictly the files touched in this milestone, not the whole project.

### 4. Verify

- Check each acceptance criterion against what was built
- Run tests if the project has them (`npm test`, `pytest`, etc.)
- Manually verify behavior where automated tests don't cover it

### 5. Update Roadmap

After completing a milestone, update the roadmap file:
- Change the milestone header status: `Not Started` or `In Progress` → `Complete`
- Check off completed acceptance criteria boxes: `- [ ]` → `- [x]`
- Leave any criteria that couldn't be completed unchecked with a note
- Commit the roadmap update

### 6. Move On

Proceed to the next eligible milestone (Step 4 logic). Continue until all milestones are complete or remaining ones are blocked.

---

## Blocker Handling

If genuinely blocked (missing credentials, external service down, ambiguous requirement that can't be resolved by reading code):

1. Update the milestone status in the roadmap: `Not Started` or `In Progress` → `Blocked`
2. Add a note below the milestone explaining what's blocking it
3. Add the blocker to CLAUDE.md under `## Known Issues` (or equivalent)
4. Commit the roadmap and CLAUDE.md updates
5. Skip to the next eligible milestone

Do NOT mark something as blocked if you can figure it out by reading more code or trying a different approach. Blocked means externally blocked — not "this is hard."

---

## Session Close

After all milestones are complete (or remaining ones are blocked):

1. **Update CLAUDE.md `## Current State`**:
   - Add completed milestones to recent completions
   - Update active work to reflect new status
   - Note any new blockers under Known Issues
   - Bump `_Last updated_` date

2. **Final commit** with a message summarizing the sprint session

3. **Report to user**: Brief summary of what was accomplished, what's blocked, and what's left

Do NOT push. The user controls when to push.

---

## Behavior Notes

- **You are autonomous.** Don't ask permission before starting each milestone — just work through them sequentially.
- **Commit as you go.** Small, descriptive commits after each logical unit of work. Never one giant commit at the end.
- **Follow existing patterns.** Read CLAUDE.md conventions and match the project's coding style. Don't introduce new patterns.
- **The roadmap IS the plan.** Don't create `.plans/` files. The roadmap milestones and their acceptance criteria are your spec.
- **Milestones are outcomes.** Each milestone represents a feature fully built, tested, and shipped — not a task completed. If a milestone's acceptance criteria are just "add column X to database," the roadmap was scoped wrong. Flag it and build toward the outcome the column serves.
- **Respect dependencies.** If M3 depends on M2, don't start M3 until M2 is complete.
- **Don't push.** Commit locally but never `git push`.
- **Don't over-engineer.** Build exactly what the acceptance criteria ask for. No bonus features.
- **Speed over perfection.** Ship working code that meets the criteria. Don't gold-plate.

## Anti-Patterns

- Asking the user what to work on next (the roadmap tells you)
- Creating `.plans/` documents (the roadmap IS the plan)
- Batching all work into one commit
- Marking a milestone complete when acceptance criteria are unchecked
- Skipping a milestone because it's hard (only skip if externally blocked)
- Adding features not in the acceptance criteria
- Pushing to remote without being asked
- Narrating the boot sequence instead of just doing it
- Stopping after one milestone to ask if you should continue
- Treating a single task (add a DB column, write one function) as a complete milestone — milestones are shipped outcomes
