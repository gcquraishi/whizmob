import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { ProtoPassport } from './types.js';

export interface InferredEdge {
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  evidence: string;
}

export type EdgeType = 'references' | 'invokes' | 'reads' | 'writes';

/**
 * Infer edges between passports by reading their source file content
 * and detecting references to other known components.
 *
 * Edge detection heuristics (high-confidence only):
 * 1. File path references — source file contains another passport's source_file path
 * 2. Skill invocations — `/skillname` patterns matching known skill invocations
 * 3. Shared state — multiple passports referencing the same external file (e.g., memory.json)
 */
export async function inferEdges(passports: ProtoPassport[]): Promise<InferredEdge[]> {
  const home = homedir();
  const edges: InferredEdge[] = [];
  const seen = new Set<string>(); // dedup key: `${source}|${target}|${type}|${evidence}`

  // Build lookup indexes
  const bySourceFile = new Map<string, ProtoPassport>();
  const byInvocation = new Map<string, ProtoPassport>();
  const allPassportPaths: { passport: ProtoPassport; expandedPath: string; tildeForm: string }[] = [];

  for (const p of passports) {
    bySourceFile.set(p.source_file, p);

    if (p.invocation) {
      byInvocation.set(p.invocation, p);
    }

    // Pre-compute both forms of the source_file path for matching
    const tildeForm = p.source_file;
    const expandedPath = tildeForm.replace(/^~/, home);
    allPassportPaths.push({ passport: p, expandedPath, tildeForm });
  }

  // Shared state tracker: file path → list of passports that reference it
  const sharedStateRefs = new Map<string, Set<string>>();

  // Known shared-state file patterns (not passport source files, but files passports reference)
  const sharedStatePatterns = [
    'memory.json',
    'cofounder/memory.json',
    'settings.json',
    '.big-heavy-panels',
  ];

  // Read each passport's source file and look for references
  const contentCache = new Map<string, string>();

  for (const p of passports) {
    const expandedPath = p.source_file.replace(/^~/, home);

    let content: string;
    try {
      content = await readFile(expandedPath, 'utf-8');
      contentCache.set(p.id, content);
    } catch {
      // File might not be readable (permissions, deleted, etc.)
      continue;
    }

    // 1. File path references — does this file mention another passport's source path?
    for (const target of allPassportPaths) {
      if (target.passport.id === p.id) continue;

      // Check both tilde and expanded forms
      if (content.includes(target.tildeForm) || content.includes(target.expandedPath)) {
        addEdge(edges, seen, {
          source_id: p.id,
          target_id: target.passport.id,
          edge_type: 'references',
          evidence: target.tildeForm,
        });
      }
    }

    // 2. Skill invocations — does this file mention `/skillname`?
    for (const [invocation, target] of byInvocation) {
      if (target.id === p.id) continue;

      // Match `/skillname` with word boundary: preceded by whitespace, backtick, or line start
      // and followed by whitespace, backtick, punctuation, or line end
      const pattern = new RegExp(`(?:^|[\\s\`"'(])${escapeRegex(invocation)}(?=[\\s\`"',.;:!?)\\n]|$)`, 'm');
      if (pattern.test(content)) {
        addEdge(edges, seen, {
          source_id: p.id,
          target_id: target.id,
          edge_type: 'invokes',
          evidence: invocation,
        });
      }
    }

    // 3. Track shared state references
    for (const statePattern of sharedStatePatterns) {
      if (content.includes(statePattern)) {
        if (!sharedStateRefs.has(statePattern)) {
          sharedStateRefs.set(statePattern, new Set());
        }
        sharedStateRefs.get(statePattern)!.add(p.id);
      }
    }
  }

  // 3. Shared state edges — connect passports that reference the same state file
  for (const [statePath, passportIds] of sharedStateRefs) {
    const ids = Array.from(passportIds);
    if (ids.length < 2) continue;

    // Create edges between all pairs (bidirectional would be redundant, use source < target)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addEdge(edges, seen, {
          source_id: ids[i],
          target_id: ids[j],
          edge_type: 'references',
          evidence: `shared:${statePath}`,
        });
      }
    }
  }

  return edges;
}

function addEdge(edges: InferredEdge[], seen: Set<string>, edge: InferredEdge): void {
  const key = `${edge.source_id}|${edge.target_id}|${edge.edge_type}|${edge.evidence}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push(edge);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
