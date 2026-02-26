---
name: debrief
description: "Session debrief — reviews the current conversation to surface prompt coaching, discovered unlocks, and SOP candidates. Run before ending a root session. Output saved to docs/debriefs/."
---

# /debrief — Session Debrief

You are reviewing the current conversation to extract learnings that make George and the agent system more effective over time. This is a self-improving feedback loop.

## When to Run

- At the end of every root (big-heavy) session
- At the end of any session where significant work was done
- George may invoke manually with `/debrief`

## Process

### Step 1: Review the Conversation

Scan the full conversation history. Look for:

1. **Prompt quality**: Places where George's instructions were vague, ambiguous, or required clarification. Also places where they were excellent and led to great results.
2. **Discovered knowledge**: Things learned during the session that aren't documented anywhere — configuration quirks, API gotchas, debugging techniques, architectural insights.
3. **Repeated patterns**: Steps that were done multiple times, friction points, workflows that could be standardized.
4. **Mistakes**: Where the model went wrong and why. What instructions would have prevented the mistake.
5. **Cross-project insights**: Discoveries in one project that apply to others.

### Step 2: Generate the Debrief

Output the following format:

```
# Session Debrief — [DATE]

## Prompt Coaching
[2-3 specific examples from THIS session where George's prompts could have been more effective. If George's prompts were excellent, say so and explain what made them effective.]

- **What you said**: "[exact quote or close paraphrase]"
- **What would have worked better**: "[improved version]"
- **Why**: [1 sentence — specificity, context, avoiding ambiguity, missing acceptance criteria, etc.]

## Discovered Unlocks
[Things learned this session that should become permanent knowledge. These are facts, not opinions.]

- [e.g., "NEXTAUTH_URL must match the port in the Procfile — add to project onboarding checklist"]
- [e.g., "Google OAuth redirect URIs can't be managed via CLI — document in CLAUDE.md"]
- [e.g., "Ticket system API returns max 50 issues per query — need pagination for teams with >50 open tickets"]

## SOP Candidates
[Patterns that repeated or caused friction — candidates for new standard operating procedures]

- [e.g., "When adding a new project to the workspace, update: workspace script, CLAUDE.md project table, .envrc, direnv allow"]
- [e.g., "Before running overmind start, always kill orphaned next dev processes first"]
- [e.g., "When creating a new skill, also add it to the root CLAUDE.md Available Skills section"]

## Action Items
- [ ] [Specific CLAUDE.md update to make — which file, which section]
- [ ] [Specific skill/agent update to make]
- [ ] [Specific checklist to add to a project]
- [ ] [Ticket to create, if applicable]
```

### Step 3: Save the Artifact

Write the debrief to `~/Documents/big-heavy/docs/debriefs/YYYY-MM-DD.md`.

If a debrief already exists for today (multiple sessions), append with a `## Session 2` header rather than overwriting.

### Step 4: Check for Pattern Accumulation

If there are 3+ debrief files in `docs/debriefs/`, scan them for recurring themes:
- If the same SOP candidate appears in 2+ debriefs, flag it for immediate extraction into CLAUDE.md
- If the same prompt coaching pattern appears in 2+ debriefs, suggest a CLAUDE.md instruction update
- If the same discovered unlock keeps being re-discovered, it's not documented well enough

Report any patterns found:
```
## Recurring Patterns (from previous debriefs)
- [Pattern]: appeared in [dates]. Recommendation: [action]
```

## Behavior Notes

- **Be honest, not flattering.** If George's prompts were great, say so briefly and move on. If they were poor, be specific about why.
- **Concrete over abstract.** "Add PORT=3001 to earthly-delights onboarding checklist" not "Consider documenting port configuration."
- **This is a playbook builder.** Every debrief makes the next session better. Treat it as institutional knowledge capture.
- **Don't pad.** If the session was short or uneventful, say "Light session — no significant learnings to capture" and skip the full format.
- **Action items must be actionable.** Each one should specify exactly what to change, in which file, in which section.
