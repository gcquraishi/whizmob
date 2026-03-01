# Whizmob — Cross-Account Portability

## North Star
George can maintain a single source of truth for each constellation (CEO OS on personal, design systems on work) and sync changes bidirectionally between accounts — with parameter substitutions handled automatically and real edits surfaced intelligently.

## Milestones

### M1: Cross-Account Dog-Food — CEO OS on Work Machine — Not Started
- **Why it matters**: Proves the whole pipeline end-to-end on real hardware. Every friction point found here is a bug to fix before anyone else tries this.
- **Acceptance criteria**:
  - [ ] Clone whizmob repo on work machine
  - [ ] `npx whizmob import ./exports/ceo-operating-system/` completes with interactive prompts — all 6 params resolved, files installed
  - [ ] Run `/roadmap` or `/cofounder` on work machine — skill works with substituted values (correct org name, correct workspace path, dynamic project discovery)
  - [ ] Document every friction point encountered during the process (filed as issues or noted in a friction log)
  - [ ] Panel hooks wired into work machine's Claude Code hooks config and functional
- **Linear tickets**: BIG-18
- **Key files**: `exports/ceo-operating-system/`, `src/import.ts`, `src/index.ts`
- **Blocked on**: George's work machine access

### M2: Constellation Versioning — Know What Changed — Not Started
- **Why it matters**: Without a changelog, re-importing is blind. You can't decide whether to update if you don't know what's different. This is the "git log" for constellations.
- **Acceptance criteria**:
  - [ ] `whizmob export` reads previous manifest (if bundle dir already exists), runs sync diff, appends a changelog entry with timestamp, summary, and files changed
  - [ ] Changelog stored in `manifest.changelog[]` — each entry: `{ version, date, summary, files_changed }`
  - [ ] `whizmob import --dry-run` shows changelog entries since last import (tracked via profile metadata: `last_imported_version`)
  - [ ] Version is a simple incrementing integer (1, 2, 3...) — semver is overkill
  - [ ] Re-export of CEO OS produces a v2 bundle with a changelog entry describing the diff from v1
  - [ ] Import profile extended: stores `last_imported_version` alongside param values
- **Linear tickets**: BIG-27
- **Key files**: `src/export.ts`, `src/sync.ts`, `src/import.ts`

### M3: Smart Update with Sync Agent — Not Started
- **Why it matters**: "I discovered an unlock on personal, now I want it on work" should be one command. And when both sides have changed, a semantic agent should resolve it — not a line-level diff tool.
- **Acceptance criteria**:
  - [ ] `whizmob update <bundle>` command: load profile → classify changes → apply safe ones → hand ambiguous ones to sync agent
  - [ ] **Three-way classification** for each file:
    - Parameter-only divergence: local file differs from bundle only due to `{{PARAM}}` substitutions → safe to overwrite with new upstream + re-substitute
    - Upstream-only: local file unchanged since last import, upstream changed → auto-apply
    - Both-changed: local edits AND upstream edits → invoke sync agent
  - [ ] **Import-time content hashing**: store hash of pre-substitution bundle content in profile. On update, reverse-substitute known params from local file and compare hash to detect real edits vs. param-only divergence.
  - [ ] **Sync agent**: constellation component (`component_type: 'agent'`) that receives both-changed files, summarizes changes in plain language, proposes resolution, and executes user's decision
  - [ ] If bundle is a git repo path, `--pull` flag runs `git pull` before syncing
  - [ ] End-to-end: edit a skill on personal → re-export → on work machine `whizmob update ./exports/ceo-operating-system/` → param-only and upstream-only changes apply automatically, both-changed files get agent-mediated resolution
- **Linear tickets**: BIG-27, BIG-28
- **Key files**: `src/sync.ts`, `src/import.ts`, `src/index.ts`, sync agent `.md` (new)

### M4: Reverse Flow — Work Design Systems to Personal — Not Started
- **Why it matters**: Validates bidirectional portability and licensing metadata. Design systems created at work have different licensing terms. Whizmob should track and respect that.
- **Acceptance criteria**:
  - [ ] Define a constellation on work machine from work-authored skills/agents
  - [ ] Export with `license: "work"` provenance — bundle includes clear licensing metadata
  - [ ] Import on personal machine — license metadata visible in `whizmob roster` and dashboard detail page
  - [ ] `whizmob import` shows informational notice when importing `license: "work"` content
  - [ ] `whizmob update` works in the reverse direction (work → personal) with same three-way classification
  - [ ] Round-trip validated: personal → work (CEO OS) AND work → personal (design systems) both functional

## Deferred (explicitly not this roadmap)
- **Cloud sync / hosted registry** — git-based transfer works for 2 accounts. Don't build infra until the use case demands it.
- **Gallery / marketplace** — public sharing is a different product surface. This roadmap is about *your* constellations on *your* machines.
- **Translation validation** — compelling demo content but doesn't serve the cross-account use case.
- **Dashboard UI for sync/update** — CLI first. Dashboard can follow.
- **Auto three-way merge** — the sync agent proposes, the user decides. No automated merge.

## Dependencies
- M1 requires work machine access (George)
- M2 can be built now on personal machine
- M3 depends on M2 (versioning is prerequisite for change classification)
- M4 requires M1 (work machine set up) and M3 (update flow working)

## Risks
- **Work machine access keeps slipping** — M2 and M3 can be built independently. Don't let M1 block progress.
- **Reverse-substitution for hash comparison** — parameter values may appear in content naturally (e.g., "George" appears as both `{{OWNER_NAME}}` substitution and in prose). Mitigation: hash comparison uses the bundle's pre-substitution content as source of truth, not reverse-engineering from the installed file.
- **Sync agent complexity** — keep M3 scoped to classification + plain-language summary + user picks. The agent proposes, it doesn't autonomously merge.
