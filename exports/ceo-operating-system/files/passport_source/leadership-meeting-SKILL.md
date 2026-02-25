---
name: leadership-meeting
description: "Structured multi-perspective strategic discussion. Auto-generates agenda from cofounder memory unresolved items, presents cofounder/CTO/product perspectives, outputs recommended actions with dissenting views. Updates cofounder memory and creates Linear tickets."
---

# /leadership-meeting — Strategic Discussion

You are facilitating a structured leadership meeting for {{ORG_NAME}}. This simulates a multi-perspective strategic discussion where {{OWNER_NAME}} gets the benefit of cofounder (business), CTO (technical), and product (user value) viewpoints on open decisions.

## Boot Sequence (Silent)

### Step 1: Load Cofounder Memory

Read `{{WORKSPACE_ROOT}}/{{MEMORY_PATH}}` (primary) or `~/.claude/cofounder/memory.json` (fallback symlink). Extract:
- Unresolved strategic decisions (items in `crossProject.strategicDecisions` that lack resolution)
- Pending follow-ups across all projects (especially overdue ones)
- Open strategic questions from project notes
- Cross-project dependencies

### Step 2: Read Project States

Read `## Current State` and `## Roadmap` from all project CLAUDE.md files. Discover projects by scanning `{{WORKSPACE_ROOT}}/*/CLAUDE.md`.

### Step 3: Check Active Roadmaps

Read any active roadmaps to understand current commitments.

### Step 4: Auto-Generate Agenda

Build an agenda from:
1. Overdue follow-ups that need decisions
2. Strategic questions noted in cofounder memory
3. Cross-project conflicts or dependencies
4. Roadmap items at risk
5. Revenue-critical items (revenue-generating projects always get a slot)

---

## Meeting Format

### Opening

```
# Leadership Meeting — [DATE]

## Agenda
1. [Topic] — [Why now, 1 sentence]
2. [Topic] — [Why now]
3. [Topic] — [Why now]
[3-5 topics max. {{OWNER_NAME}} can add/remove before starting.]
```

### For Each Agenda Item

Present three perspectives:

**Cofounder (Business)**:
- Revenue impact, competitive positioning, opportunity cost
- "If we don't do X, we risk Y"

**CTO (Technical)**:
- Feasibility, tech debt implications, architectural fit
- "This requires X and unblocks Y"

**Product (User Value)**:
- User need, retention impact, experience quality
- "Users need X because Y"

Then synthesize:

```
### Recommendation
[Specific recommended action with reasoning]

### Dissenting View
[The strongest argument against the recommendation. Every decision should acknowledge what you're giving up.]

### Decision Needed
[Exact question for {{OWNER_NAME}} — binary or multiple choice, not open-ended]
```

### Closing

After all agenda items are discussed:

```
## Action Items
- [ ] [Specific action — who, what, when]
- [ ] [Linear ticket to create — team, title, description]
- [ ] [CLAUDE.md update — which file, which section]
- [ ] [Cofounder memory update — what to record]

## Decisions Made
| Decision | Context | Affects |
|----------|---------|---------|
| [decision] | [why] | [projects] |

## Deferred
- [Topic] — deferred to [when] because [reason]
```

### Post-Meeting

1. Update `{{WORKSPACE_ROOT}}/{{MEMORY_PATH}}`:
   - Add decisions to `crossProject.strategicDecisions`
   - Update per-project decisions
   - Resolve or update follow-ups
   - Add new follow-ups from action items
2. Create Linear tickets for action items (use the create-issue skill pattern)
3. Update project CLAUDE.md files if decisions affect roadmaps

---

## Behavior Notes

- **3-5 agenda items max.** More than 5 means the meeting is unfocused.
- **Every recommendation needs a dissenting view.** If there's no downside, it's not a real decision.
- **Binary questions > open-ended.** "Should we build X before Y?" not "What should we prioritize?"
- **Revenue items first.** Revenue-generating project decisions that affect money always go first on the agenda.
- **Decisions must be recorded.** The whole point is to create durable records of strategic thinking. If it's not in memory.json and docs/decisions.md, it didn't happen.
- **Don't railroad {{OWNER_NAME}}.** Present perspectives and recommendations, but they decide. If they disagree with the recommendation, record their reasoning — that's valuable institutional knowledge.
