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
  // Be specific: 'memory.json' alone is too generic and creates false connections.
  const sharedStatePatterns = [
    'cofounder/memory.json',
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

/**
 * Discovered mob: a cluster of tightly-connected passports found via
 * connectivity-based clustering of the edge graph.
 */
export interface DiscoveredMob {
  id: string;
  name: string;
  members: string[];   // passport IDs
  edgeCount: number;   // edges within this cluster
}

/**
 * Cluster passports into discovered mobs using connected components
 * on the edge graph. Each connected component with 2+ members
 * becomes a discovered mob. Singletons are "islands."
 *
 * Filtering: project configs and settings are excluded from clustering
 * since they're infrastructure (CLAUDE.md files reference everything,
 * creating one giant cluster). They appear in the inventory instead.
 *
 * Naming: uses the most-connected node's name + " System" as a default.
 */
export function clusterMobs(
  edges: InferredEdge[],
  passportNames: Map<string, string>,
  passportTypes?: Map<string, string>,
): DiscoveredMob[] {
  // Filter out edges involving project/settings passports — they're infrastructure
  const excludedTypes = new Set(['project', 'settings']);
  const filteredEdges = passportTypes
    ? edges.filter(e => {
        const sourceType = passportTypes.get(e.source_id);
        const targetType = passportTypes.get(e.target_id);
        return (!sourceType || !excludedTypes.has(sourceType)) &&
               (!targetType || !excludedTypes.has(targetType));
      })
    : edges;

  // Build adjacency list (undirected)
  const adj = new Map<string, Set<string>>();
  for (const e of filteredEdges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, new Set());
    if (!adj.has(e.target_id)) adj.set(e.target_id, new Set());
    adj.get(e.source_id)!.add(e.target_id);
    adj.get(e.target_id)!.add(e.source_id);
  }

  // BFS to find connected components
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const component: string[] = [];
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }

  // Filter to clusters with 2+ members and build mob objects
  const mobs: DiscoveredMob[] = [];

  for (const members of components) {
    if (members.length < 2) continue;

    const memberSet = new Set(members);

    // Count internal edges
    let edgeCount = 0;
    for (const e of edges) {
      if (memberSet.has(e.source_id) && memberSet.has(e.target_id)) {
        edgeCount++;
      }
    }

    // Name: most-connected node in this cluster
    const degreesInCluster = new Map<string, number>();
    for (const m of members) {
      let degree = 0;
      for (const neighbor of adj.get(m) || []) {
        if (memberSet.has(neighbor)) degree++;
      }
      degreesInCluster.set(m, degree);
    }
    const hub = members.reduce((a, b) =>
      (degreesInCluster.get(a) || 0) >= (degreesInCluster.get(b) || 0) ? a : b
    );
    const hubName = passportNames.get(hub) || hub;

    // Generate a stable ID from sorted member IDs
    const sortedMembers = [...members].sort();
    const id = `discovered-${sortedMembers.slice(0, 3).join('-').substring(0, 40)}`;

    mobs.push({
      id,
      name: `${hubName} System`,
      members: sortedMembers,
      edgeCount,
    });
  }

  // Sort by size descending
  mobs.sort((a, b) => b.members.length - a.members.length);

  return mobs;
}
