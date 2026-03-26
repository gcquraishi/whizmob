/**
 * Browser-based scanner that uses the File System Access API to read
 * agent config files directly from the user's filesystem.
 *
 * Produces the same ProtoPassport shape as the CLI scanner so the
 * InspectorGraph component can render the results unchanged.
 *
 * No data leaves the browser. All parsing happens client-side.
 */

// ---- Types (mirrored from src/types.ts to avoid Node imports) ----

export type Platform = 'claude-code' | 'codex' | 'cursor' | 'windsurf' | 'copilot' | 'aider' | 'continue';
export type AgentType = 'subagent' | 'skill' | 'mcp' | 'project' | 'settings' | 'extension';
export type AgentScope = 'user' | 'project';
export type AgentStatus = 'active' | 'draft' | 'archived';

export interface ProtoPassport {
  id: string;
  name: string;
  type: AgentType;
  platform: Platform;
  scope: AgentScope;
  purpose: string;
  model_hint?: string | null;
  invocation?: string | null;
  status: AgentStatus;
  tags: string[];
  source_file: string;
  origin?: string | null;
  author?: string | null;
  mode?: string | null;
  metadata: Record<string, unknown>;
}

export interface InferredEdge {
  source_id: string;
  target_id: string;
  edge_type: 'references' | 'invokes' | 'reads' | 'writes';
  evidence: string;
}

export interface DiscoveredMob {
  id: string;
  name: string;
  members: string[];
  edgeCount: number;
}

export interface BrowserScanResult {
  passports: ProtoPassport[];
  edges: InferredEdge[];
  mobs: DiscoveredMob[];
  scanned_at: string;
  scan_duration_ms: number;
  dirName: string;
}

// ---- Utility functions ----

function toKebab(s: string): string {
  return s.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

function titleCase(s: string): string {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function extractFirstParagraph(content: string): string {
  const lines = content.split('\n');
  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('**') && !trimmed.startsWith('---')) {
        started = true;
        paragraphLines.push(trimmed);
      }
      continue;
    }
    if (!trimmed || trimmed.startsWith('#')) break;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').slice(0, 300);
}

/**
 * Lightweight frontmatter parser (replaces gray-matter for browser use).
 * Handles simple YAML key: value pairs — sufficient for agent/skill metadata.
 */
function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const data: Record<string, string> = {};

  if (!raw.startsWith('---')) {
    return { data, content: raw };
  }

  const endIdx = raw.indexOf('---', 3);
  if (endIdx === -1) {
    return { data, content: raw };
  }

  const yamlBlock = raw.slice(3, endIdx).trim();
  const content = raw.slice(endIdx + 3).trim();

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }

  return { data, content };
}

// ---- File System Access helpers ----

async function readTextFile(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

/**
 * Recursively walk a directory handle, yielding { path, handle } pairs.
 * maxDepth prevents runaway traversal.
 */
async function* walkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path: string = '',
  maxDepth: number = 6,
): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  if (maxDepth <= 0) return;

  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      yield { path: entryPath, handle: entry as FileSystemFileHandle };
    } else if (entry.kind === 'directory') {
      // Skip known noise directories
      const skip = ['node_modules', '.git', '.next', '__pycache__', '.venv'];
      if (skip.includes(entry.name)) continue;

      yield* walkDirectory(entry as FileSystemDirectoryHandle, entryPath, maxDepth - 1);
    }
  }
}

/**
 * Try to get a subdirectory by path segments. Returns null if not found.
 */
async function getSubDir(
  root: FileSystemDirectoryHandle,
  ...segments: string[]
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  for (const seg of segments) {
    try {
      current = await current.getDirectoryHandle(seg);
    } catch {
      return null;
    }
  }
  return current;
}

async function getFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(name);
  } catch {
    return null;
  }
}

// ---- Parsers ----

async function parseAgents(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];
  const agentsDir = await getSubDir(dirHandle, 'agents');
  if (!agentsDir) return passports;

  for await (const entry of agentsDir.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
    if (entry.name.toLowerCase() === 'readme.md') continue;

    try {
      const raw = await readTextFile(entry as FileSystemFileHandle);
      const { data: fm, content } = parseFrontmatter(raw);
      const filename = entry.name.replace(/\.md$/, '');

      const name = fm.name
        ? fm.name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : filename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const kebab = toKebab(fm.name || filename);
      const id = `agent-${kebab}`;

      let purpose = '';
      if (fm.description) {
        purpose = fm.description.split('\n')[0].replace(/<[^>]+>/g, '').trim();
      }
      if (!purpose) {
        purpose = extractFirstParagraph(content);
      }

      passports.push({
        id,
        name,
        type: 'subagent',
        platform: 'claude-code',
        scope: 'user',
        purpose,
        model_hint: fm.model || null,
        invocation: null,
        status: 'active',
        tags: [],
        source_file: `~/${dirName}/agents/${entry.name}`,
        metadata: {
          ...(fm.color ? { color: fm.color } : {}),
        },
      });
    } catch {
      // Skip unparseable files
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}

async function parseSkills(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
  platform: Platform = 'claude-code',
): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];
  const skillsDir = await getSubDir(dirHandle, 'skills');
  if (!skillsDir) return passports;

  const idPrefix = platform === 'claude-code' ? 'skill' : `${platform}-skill`;

  for await (const entry of skillsDir.values()) {
    if (entry.kind !== 'directory') continue;

    const skillDir = entry as FileSystemDirectoryHandle;
    const skillMdHandle = await getFile(skillDir, 'SKILL.md');
    if (!skillMdHandle) continue;

    try {
      const raw = await readTextFile(skillMdHandle);
      const { data: fm, content } = parseFrontmatter(raw);
      const skillDirName = entry.name;
      const invocation = `/${skillDirName}`;

      let name = '';
      if (fm.name) {
        name = titleCase(fm.name);
      } else {
        const headingMatch = content.match(/^#\s+(.+)$/m);
        if (headingMatch) {
          name = headingMatch[1].trim();
        } else {
          name = titleCase(skillDirName);
        }
      }

      let purpose = '';
      if (fm.description) {
        purpose = fm.description.split('\n')[0].trim();
      }
      if (!purpose) {
        purpose = extractFirstParagraph(content);
      }

      const kebab = toKebab(skillDirName);

      passports.push({
        id: `${idPrefix}-${kebab}`,
        name,
        type: 'skill',
        platform,
        scope: 'user',
        purpose,
        model_hint: fm.model || null,
        invocation,
        status: 'active',
        tags: [],
        source_file: `~/${dirName}/skills/${skillDirName}/SKILL.md`,
        mode: fm.mode || null,
        metadata: {},
      });
    } catch {
      // Skip unparseable skills
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}

async function parseMcpFile(
  fileHandle: FileSystemFileHandle,
  sourcePath: string,
  platform: Platform,
): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];

  try {
    const raw = await readTextFile(fileHandle);
    const parsed = JSON.parse(raw);

    if (!parsed.mcpServers) return passports;

    for (const [serverName, config] of Object.entries(parsed.mcpServers)) {
      const cfg = config as { command?: string; args?: string[]; env?: Record<string, string>; url?: string };
      const kebab = toKebab(serverName);
      const idPrefix = platform === 'claude-code' ? 'mcp' : `${platform}-mcp`;
      const purpose = cfg.url
        ? `MCP server: ${cfg.url}`
        : `MCP server: ${cfg.command || 'unknown'}`;

      passports.push({
        id: `${idPrefix}-${kebab}`,
        name: titleCase(serverName),
        type: 'mcp',
        platform,
        scope: 'project',
        purpose,
        model_hint: null,
        invocation: null,
        status: 'active',
        tags: [],
        source_file: sourcePath,
        metadata: {
          command: cfg.command || null,
          args: cfg.args || [],
          env_keys: Object.keys(cfg.env || {}),
          ...(cfg.url ? { url: cfg.url } : {}),
        },
      });
    }
  } catch {
    // Invalid JSON or unreadable — skip
  }

  return passports;
}

async function parseMcp(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];

  // Look for .mcp.json in the root of the scanned directory
  const mcpHandle = await getFile(dirHandle, '.mcp.json');
  if (mcpHandle) {
    const results = await parseMcpFile(mcpHandle, `~/${dirName}/.mcp.json`, 'claude-code');
    passports.push(...results);
  }

  // Walk subdirectories looking for .mcp.json files
  for await (const { path, handle } of walkDirectory(dirHandle, '', 4)) {
    if (path.endsWith('.mcp.json') && path !== '.mcp.json') {
      const platform = detectPlatformFromPath(path);
      const results = await parseMcpFile(handle, `~/${dirName}/${path}`, platform);
      passports.push(...results);
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}

function detectPlatformFromPath(path: string): Platform {
  if (path.includes('.cursor')) return 'cursor';
  if (path.includes('.windsurf') || path.includes('.codeium')) return 'windsurf';
  return 'claude-code';
}

async function parseSettings(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<ProtoPassport[]> {
  const settingsHandle = await getFile(dirHandle, 'settings.json');
  if (!settingsHandle) return [];

  try {
    const raw = await readTextFile(settingsHandle);
    const settings = JSON.parse(raw);

    const model = typeof settings.model === 'string' ? settings.model : null;
    const permMode = settings.permissions?.defaultMode || 'unknown';

    return [{
      id: 'settings-global',
      name: 'Global Settings',
      type: 'settings',
      platform: 'claude-code',
      scope: 'user',
      purpose: `Default model: ${model || 'not set'}, permissions: ${permMode}`,
      model_hint: model,
      invocation: null,
      status: 'active',
      tags: [],
      source_file: `~/${dirName}/settings.json`,
      metadata: {
        default_model: model,
        permissions_mode: permMode,
      },
    }];
  } catch {
    return [];
  }
}

async function parseProjects(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];

  // Walk looking for CLAUDE.md files in subdirectories
  for await (const { path, handle } of walkDirectory(dirHandle, '', 4)) {
    const segments = path.split('/');
    const fileName = segments[segments.length - 1];

    if (fileName !== 'CLAUDE.md') continue;

    try {
      const raw = await readTextFile(handle);
      const headingMatch = raw.match(/^#\s+(.+)$/m);
      // Project dir is the parent of CLAUDE.md
      const projectDirName = segments.length > 1 ? segments[segments.length - 2] : dirName;
      const name = headingMatch ? headingMatch[1].trim() : projectDirName;
      const purpose = extractFirstParagraph(raw);
      const kebab = toKebab(projectDirName);

      passports.push({
        id: `project-${kebab}`,
        name,
        type: 'project',
        platform: 'claude-code',
        scope: 'project',
        purpose,
        model_hint: null,
        invocation: null,
        status: 'active',
        tags: [],
        source_file: `~/${dirName}/${path}`,
        metadata: {
          directory: `~/${dirName}/${segments.slice(0, -1).join('/')}`,
        },
      });
    } catch {
      // Skip unreadable files
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}

// ---- Edge inference (pure logic, ported from src/edges.ts) ----

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function inferEdges(
  passports: ProtoPassport[],
  fileContents: Map<string, string>,
): Promise<InferredEdge[]> {
  const edges: InferredEdge[] = [];
  const seen = new Set<string>();

  // Build lookup indexes
  const byInvocation = new Map<string, ProtoPassport>();
  const allPassportPaths: { passport: ProtoPassport; sourcePath: string }[] = [];

  for (const p of passports) {
    if (p.invocation) {
      byInvocation.set(p.invocation, p);
    }
    allPassportPaths.push({ passport: p, sourcePath: p.source_file });
  }

  // Shared state tracker
  const sharedStatePatterns = ['cofounder/memory.json', '.big-heavy-panels'];
  const sharedStateRefs = new Map<string, Set<string>>();

  for (const p of passports) {
    const content = fileContents.get(p.id);
    if (!content) continue;

    // 1. File path references
    for (const target of allPassportPaths) {
      if (target.passport.id === p.id) continue;

      if (content.includes(target.sourcePath)) {
        addEdge(edges, seen, {
          source_id: p.id,
          target_id: target.passport.id,
          edge_type: 'references',
          evidence: target.sourcePath,
        });
      }
    }

    // 2. Skill invocations
    for (const [invocation, target] of byInvocation) {
      if (target.id === p.id) continue;

      const pattern = new RegExp(
        `(?:^|[\\s\`"'(])${escapeRegex(invocation)}(?=[\\s\`"',.;:!?)\\n]|$)`,
        'm',
      );
      if (pattern.test(content)) {
        addEdge(edges, seen, {
          source_id: p.id,
          target_id: target.id,
          edge_type: 'invokes',
          evidence: invocation,
        });
      }
    }

    // 3. Shared state references
    for (const statePattern of sharedStatePatterns) {
      if (content.includes(statePattern)) {
        if (!sharedStateRefs.has(statePattern)) {
          sharedStateRefs.set(statePattern, new Set());
        }
        sharedStateRefs.get(statePattern)!.add(p.id);
      }
    }
  }

  // Connect passports that reference the same state file
  for (const [statePath, passportIds] of sharedStateRefs) {
    const ids = Array.from(passportIds);
    if (ids.length < 2) continue;

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

// ---- Mob clustering (pure logic, ported from src/edges.ts) ----

function clusterMobs(
  edges: InferredEdge[],
  passports: ProtoPassport[],
): DiscoveredMob[] {
  const passportNames = new Map(passports.map(p => [p.id, p.name]));
  const passportTypes = new Map(passports.map(p => [p.id, p.type]));

  // Filter out infrastructure types
  const excludedTypes = new Set(['project', 'settings']);
  const filteredEdges = edges.filter(e => {
    const sourceType = passportTypes.get(e.source_id);
    const targetType = passportTypes.get(e.target_id);
    return (!sourceType || !excludedTypes.has(sourceType)) &&
           (!targetType || !excludedTypes.has(targetType));
  });

  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const e of filteredEdges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, new Set());
    if (!adj.has(e.target_id)) adj.set(e.target_id, new Set());
    adj.get(e.source_id)!.add(e.target_id);
    adj.get(e.target_id)!.add(e.source_id);
  }

  // BFS connected components
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

  const mobs: DiscoveredMob[] = [];

  for (const members of components) {
    if (members.length < 2) continue;

    const memberSet = new Set(members);
    let edgeCount = 0;
    for (const e of edges) {
      if (memberSet.has(e.source_id) && memberSet.has(e.target_id)) {
        edgeCount++;
      }
    }

    // Name: most-connected node
    const degreesInCluster = new Map<string, number>();
    for (const m of members) {
      let degree = 0;
      for (const neighbor of adj.get(m) || []) {
        if (memberSet.has(neighbor)) degree++;
      }
      degreesInCluster.set(m, degree);
    }
    const hub = members.reduce((a, b) =>
      (degreesInCluster.get(a) || 0) >= (degreesInCluster.get(b) || 0) ? a : b,
    );
    const hubName = passportNames.get(hub) || hub;

    const sortedMembers = [...members].sort();
    const id = `discovered-${sortedMembers.slice(0, 3).join('-').substring(0, 40)}`;

    mobs.push({ id, name: `${hubName} System`, members: sortedMembers, edgeCount });
  }

  mobs.sort((a, b) => b.members.length - a.members.length);
  return mobs;
}

// ---- Main scan function ----

/**
 * Perform a browser-based scan of the selected directory.
 * Returns passports, edges, and mobs in the same shape the dashboard expects.
 */
export async function browserScan(
  dirHandle: FileSystemDirectoryHandle,
): Promise<BrowserScanResult> {
  const start = Date.now();
  const dirName = dirHandle.name;

  // Run parsers
  const [agents, skills, mcp, settings, projects] = await Promise.all([
    parseAgents(dirHandle, dirName),
    parseSkills(dirHandle, dirName),
    parseMcp(dirHandle, dirName),
    parseSettings(dirHandle, dirName),
    parseProjects(dirHandle, dirName),
  ]);

  const passports = [...agents, ...skills, ...mcp, ...settings, ...projects];

  // Deduplicate by ID (same logic as CLI)
  const seen = new Map<string, ProtoPassport>();
  for (const p of passports) {
    if (!seen.has(p.id)) {
      seen.set(p.id, p);
    }
  }
  const dedupedPassports = Array.from(seen.values());

  // Build file content map for edge inference
  // Re-read source files for the passports we found
  const fileContents = new Map<string, string>();
  for await (const { path, handle } of walkDirectory(dirHandle, '', 6)) {
    // Match against known passport source files
    for (const p of dedupedPassports) {
      const expectedSuffix = p.source_file.replace(`~/${dirName}/`, '');
      if (path === expectedSuffix) {
        try {
          const content = await readTextFile(handle);
          fileContents.set(p.id, content);
        } catch {
          // Skip unreadable
        }
      }
    }
  }

  // Edge inference
  const edges = await inferEdges(dedupedPassports, fileContents);

  // Mob clustering
  const mobs = clusterMobs(edges, dedupedPassports);

  return {
    passports: dedupedPassports,
    edges,
    mobs,
    scanned_at: new Date().toISOString(),
    scan_duration_ms: Date.now() - start,
    dirName,
  };
}

/**
 * Check if the File System Access API is available (Chrome/Edge only).
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
