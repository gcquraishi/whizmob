import type { InferredEdge } from './edges.js';

export interface AutoSubMob {
  id: string;
  name: string;
  description: string;
  member_ids: string[];
  pattern: 'invocation-chain' | 'shared-state' | 'hook-group';
}

interface PassportInfo {
  id: string;
  name: string;
  type: string;
  invocation: string | null;
}

/**
 * Discover sub-groups within a connected component using heuristics:
 * 1. Invocation chains — A invokes B invokes C = workflow
 * 2. Shared state — components referencing the same state file
 * 3. Hook grouping — hooks + the components they relate to
 *
 * Returns auto-discovered sub-mobs. A component can appear in multiple sub-mobs.
 * Components that don't fit any heuristic are left ungrouped.
 */
export function discoverSubMobs(
  memberIds: string[],
  edges: InferredEdge[],
  passportInfo: Map<string, PassportInfo>,
): AutoSubMob[] {
  const memberSet = new Set(memberIds);
  const internalEdges = edges.filter(
    e => memberSet.has(e.source_id) && memberSet.has(e.target_id)
  );

  const subMobs: AutoSubMob[] = [];
  const assigned = new Set<string>();

  // 1. Invocation chains — find connected subgraphs through 'invokes' edges
  const invokeChains = findInvocationChains(internalEdges, memberSet, passportInfo);
  for (const chain of invokeChains) {
    if (chain.length < 2) continue;
    const chainNames = chain
      .map(id => passportInfo.get(id)?.name || id)
      .filter(Boolean);
    const rootName = chainNames[0];
    const slug = slugify(rootName);

    subMobs.push({
      id: `auto-${slug}-workflow`,
      name: `${rootName} Workflow`,
      description: `Invocation chain: ${chainNames.join(' → ')}`,
      member_ids: chain,
      pattern: 'invocation-chain',
    });
    for (const id of chain) assigned.add(id);
  }

  // 2. Shared state clusters — group components by shared state evidence
  const stateGroups = findSharedStateGroups(internalEdges, memberSet, passportInfo);
  for (const group of stateGroups) {
    if (group.members.length < 2) continue;
    // Skip if most members are already in an invocation chain
    const newMembers = group.members.filter(id => !assigned.has(id));
    if (newMembers.length < 1 && group.members.length <= 3) continue;

    subMobs.push({
      id: `auto-${slugify(group.stateName)}-state`,
      name: `${group.stateName} State`,
      description: `Components sharing state: ${group.stateFile}`,
      member_ids: group.members,
      pattern: 'shared-state',
    });
    for (const id of group.members) assigned.add(id);
  }

  // 3. Hook grouping — hooks and the components they reference
  const hookGroups = findHookGroups(internalEdges, memberSet, passportInfo);
  for (const group of hookGroups) {
    if (group.members.length < 2) continue;

    subMobs.push({
      id: `auto-${slugify(group.hookName)}-hooks`,
      name: `${group.hookName} Hooks`,
      description: `Hook trigger group: ${group.hookNames.join(', ')}`,
      member_ids: group.members,
      pattern: 'hook-group',
    });
    for (const id of group.members) assigned.add(id);
  }

  return subMobs;
}

/**
 * Find invocation chains by tracing 'invokes' edges.
 * Uses DFS to find maximal paths through the invocation graph.
 */
function findInvocationChains(
  edges: InferredEdge[],
  memberSet: Set<string>,
  passportInfo: Map<string, PassportInfo>,
): string[][] {
  // Build directed adjacency for 'invokes' edges
  const invokeAdj = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const e of edges) {
    if (e.edge_type !== 'invokes') continue;
    if (!memberSet.has(e.source_id) || !memberSet.has(e.target_id)) continue;

    if (!invokeAdj.has(e.source_id)) invokeAdj.set(e.source_id, new Set());
    invokeAdj.get(e.source_id)!.add(e.target_id);
    inDegree.set(e.target_id, (inDegree.get(e.target_id) || 0) + 1);
    if (!inDegree.has(e.source_id)) inDegree.set(e.source_id, 0);
  }

  if (invokeAdj.size === 0) return [];

  // Find roots (in-degree 0 within invocation subgraph)
  const roots: string[] = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0 && invokeAdj.has(node)) roots.push(node);
  }

  // If no roots (cycle), pick highest out-degree node
  if (roots.length === 0) {
    let best = '';
    let bestDeg = -1;
    for (const [node, neighbors] of invokeAdj) {
      if (neighbors.size > bestDeg) {
        best = node;
        bestDeg = neighbors.size;
      }
    }
    if (best) roots.push(best);
  }

  // DFS from each root to find chains
  const chains: string[][] = [];
  const visited = new Set<string>();

  for (const root of roots) {
    if (visited.has(root)) continue;
    const chain: string[] = [];
    const stack = [root];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      chain.push(node);

      const neighbors = invokeAdj.get(node);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visited.has(n)) stack.push(n);
        }
      }
    }

    if (chain.length >= 2) {
      chains.push(chain);
    }
  }

  // Merge overlapping chains
  return mergeOverlapping(chains);
}

interface StateGroup {
  stateFile: string;
  stateName: string;
  members: string[];
}

/**
 * Find groups of components that share state (evidence: "shared:*").
 */
function findSharedStateGroups(
  edges: InferredEdge[],
  memberSet: Set<string>,
  _passportInfo: Map<string, PassportInfo>,
): StateGroup[] {
  const stateRefs = new Map<string, Set<string>>();

  for (const e of edges) {
    if (!e.evidence.startsWith('shared:')) continue;
    const stateFile = e.evidence.replace('shared:', '');
    if (!stateRefs.has(stateFile)) stateRefs.set(stateFile, new Set());
    if (memberSet.has(e.source_id)) stateRefs.get(stateFile)!.add(e.source_id);
    if (memberSet.has(e.target_id)) stateRefs.get(stateFile)!.add(e.target_id);
  }

  const groups: StateGroup[] = [];
  for (const [stateFile, members] of stateRefs) {
    if (members.size < 2) continue;
    // Generate a readable name from the state file path
    const parts = stateFile.split('/');
    const fileName = parts.pop() || stateFile;
    const stateName = fileName.replace(/\.\w+$/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    groups.push({
      stateFile,
      stateName,
      members: Array.from(members),
    });
  }

  return groups;
}

interface HookGroup {
  hookName: string;
  hookNames: string[];
  members: string[];
}

/**
 * Find hook groups — components whose name or type suggests they're hooks,
 * plus the components they reference.
 */
function findHookGroups(
  edges: InferredEdge[],
  memberSet: Set<string>,
  passportInfo: Map<string, PassportInfo>,
): HookGroup[] {
  // Identify hook-like components
  const hookIds: string[] = [];
  for (const id of memberSet) {
    const info = passportInfo.get(id);
    if (!info) continue;
    const nameLower = info.name.toLowerCase();
    if (
      nameLower.includes('hook') ||
      nameLower.includes('panel-start') ||
      nameLower.includes('panel-stop') ||
      nameLower.includes('session-start') ||
      nameLower.includes('session-stop') ||
      info.invocation?.includes('hook')
    ) {
      hookIds.push(id);
    }
  }

  if (hookIds.length === 0) return [];

  // Find components connected to hooks
  const hookSet = new Set(hookIds);
  const hookNeighbors = new Set<string>(hookIds);

  for (const e of edges) {
    if (hookSet.has(e.source_id) && memberSet.has(e.target_id)) {
      hookNeighbors.add(e.target_id);
    }
    if (hookSet.has(e.target_id) && memberSet.has(e.source_id)) {
      hookNeighbors.add(e.source_id);
    }
  }

  if (hookNeighbors.size < 2) return [];

  const hookNames = hookIds.map(id => passportInfo.get(id)?.name || id);
  return [{
    hookName: 'Session',
    hookNames,
    members: Array.from(hookNeighbors),
  }];
}

/**
 * Merge chains that share members.
 */
function mergeOverlapping(chains: string[][]): string[][] {
  if (chains.length <= 1) return chains;

  const merged: string[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < chains.length; i++) {
    if (used.has(i)) continue;
    const combined = new Set(chains[i]);

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = i + 1; j < chains.length; j++) {
        if (used.has(j)) continue;
        if (chains[j].some(id => combined.has(id))) {
          for (const id of chains[j]) combined.add(id);
          used.add(j);
          changed = true;
        }
      }
    }

    merged.push(Array.from(combined));
  }

  return merged;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
}
