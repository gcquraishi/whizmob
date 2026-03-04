import Database from 'better-sqlite3';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { slugify } from './mob.js';
import { syncMob } from './sync.js';
import type { ComponentType, LicenseType } from './types.js';

const DB_DIR = join(homedir(), '.whizmob');
const DB_PATH = join(DB_DIR, 'whizmob.db');

/** Resolve the active DB path — tests can override via WHIZMOB_DB_PATH env var. */
function resolveDbPath(): string {
  return process.env.WHIZMOB_DB_PATH || DB_PATH;
}

// Path parameters for portability
const PATH_PARAMS: [string, string][] = [
  // Order matters — most specific first
  ['{{CLAUDE_DIR}}', join(homedir(), '.claude')],
  ['{{WHIZMOB_DIR}}', DB_DIR],
  ['{{HOME}}', homedir()],
];

export interface ContentParameter {
  description: string;
  required: boolean;
  default_value: string | null;
}

export interface ChangelogEntry {
  version: number;
  date: string;
  summary: string;
  files_changed: string[];
}

export interface MobHierarchyEntry {
  id: string;
  name: string;
  description: string;
  display_order: number;
}

export interface ExportManifest {
  version: '1.0';
  bundle_version: number;
  mob: {
    id: string;
    name: string;
    description: string;
    author: string | null;
  };
  hierarchy?: MobHierarchyEntry[];
  exported_at: string;
  exported_from: string; // machine hostname
  files: ExportFileEntry[];
  dependencies: ExportDependency[];
  parameters: Record<string, string>; // path param name → description
  content_parameters: Record<string, ContentParameter>; // content param name → metadata
  changelog: ChangelogEntry[];
}

export interface ExportFileEntry {
  /** Relative path within the bundle */
  bundle_path: string;
  /** Parameterized original path (e.g. {{CLAUDE_DIR}}/skills/foo/SKILL.md) */
  original_path: string;
  /** Component type from the mob */
  component_type: ComponentType | 'passport_source';
  /** Role label if set */
  role: string | null;
  /** Passport name if this is a passport source file */
  passport_name: string | null;
  /** Whether secrets were stripped from this file */
  secrets_stripped: boolean;
  /** Whether this is a memory schema (structure only, no data) */
  memory_bootstrapped: boolean;
  /** Provenance: who authored this agent */
  provenance?: {
    origin: string | null;
    author: string | null;
    license: LicenseType | null;
    forked_from: string | null;
  };
}

export interface ExportDependency {
  type: 'mcp_server' | 'npm_package' | 'tool';
  name: string;
  required: boolean;
}

export interface ExportResult {
  bundleDir: string;
  manifest: ExportManifest;
  fileCount: number;
  secretsStripped: number;
  memoryBootstrapped: number;
  contentParamsDetected: number;
  warnings: string[];
}

// Patterns that indicate secrets — specific enough to avoid matching prose
// like "key files" or "token count". Only match assignment/config patterns.

// Suffixes that indicate config values, not secrets (e.g., TOKEN_EXPIRY, KEY_SIZE)
const SAFE_KEY_SUFFIXES = /(?:_EXPIRY|_TIMEOUT|_COUNT|_SIZE|_LIMIT|_PORT|_LENGTH|_MAX|_MIN|_TTL|_INTERVAL|_RETRIES|_DELAY|_DURATION|_RATE|_THRESHOLD|_TYPE|_NAME|_PATH|_DIR|_FILE|_FORMAT|_MODE|_LEVEL|_INDEX|_EXCHANGE)$/;

// Key names that look like they contain secret words but are not secrets.
// These are common in database schemas, docs, and config that refer to concepts, not values.
const SAFE_KEY_NAMES = new Set([
  'primary_key', 'foreign_key', 'unique_key', 'sort_key', 'partition_key',
  'key_file', 'key_path', 'key_type', 'key_name', 'key_format', 'key_size',
  'token_count', 'token_type', 'token_limit', 'token_usage',
  'secret_name', 'secret_path',
]);

const SECRET_PATTERNS = [
  // JSON-style: "some_secret_key": "value" — requires a secret word as a SUFFIX
  // of the key name (not just anywhere in it). E.g., "api_key": "..." matches,
  // but "key_file": "..." does not.
  /"\w*(?:password|secret|_token|api_key|apikey|private_key|auth_token|access_token|secret_key|_credential)\w*"\s*:\s*"[^"]+"/gi,
  // YAML/env-style: SECRET_KEY=value or SECRET_KEY: value (uppercase key names)
  // Excludes numeric-only values (e.g., TOKEN_EXPIRY: 3600) and boolean-like values
  /\b[A-Z_]*(?:PASSWORD|SECRET|_TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z_]*\s*[:=]\s*(?![\d]+(?:\s|$))(?!(?:true|false|null|none|yes|no)(?:\s|$))(?:\S+)/g,
  // Known key formats
  /sk[-_][a-zA-Z0-9]{20,}/g, // Stripe-style keys
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub PATs
  /xoxb-[a-zA-Z0-9-]+/g, // Slack bot tokens
];

/** BFS to collect all descendant mob IDs. */
function collectDescendantIds(db: Database.Database, rootId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = db.prepare(
      `SELECT child_mob_id FROM mob_children WHERE parent_mob_id = ?`
    ).all(current) as { child_mob_id: string }[];
    for (const c of children) {
      if (!descendants.has(c.child_mob_id)) {
        descendants.add(c.child_mob_id);
        queue.push(c.child_mob_id);
      }
    }
  }
  return descendants;
}

function expandTilde(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

function parameterizePath(absolutePath: string): string {
  let result = expandTilde(absolutePath);
  for (const [param, value] of PATH_PARAMS) {
    if (result.startsWith(value)) {
      result = param + result.slice(value.length);
      break;
    }
  }
  return result;
}

/** Exported for testing — strips secret values from file content. */
export function stripSecrets(content: string, filePath: string): { content: string; stripped: boolean } {
  let modified = content;
  let stripped = false;

  // For .mcp.json files, redact env blocks
  if (basename(filePath) === '.mcp.json' || basename(filePath) === 'mcp.json') {
    modified = modified.replace(/"env"\s*:\s*\{[^}]*\}/g, (match) => {
      stripped = true;
      return '"env": { "REDACTED": "Set during import" }';
    });
  }

  // For settings.json, redact sensitive fields (require underscore-prefixed secret words to avoid matching "key" in prose)
  if (basename(filePath) === 'settings.json') {
    modified = modified.replace(/"\w*(?:password|secret|_token|_key|credential|api_key|private_key)\w*"\s*:\s*"[^"]*"/gi, (match) => {
      stripped = true;
      const key = match.split(':')[0];
      return `${key}: "REDACTED"`;
    });
  }

  // General secret pattern stripping for any file
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    modified = modified.replace(regex, (match) => {
      // Extract the key name (before = or :) and skip safe suffixes/names
      const eqIdx = match.indexOf('=');
      const colonIdx = match.indexOf(':');
      const sepIdx = eqIdx >= 0 && (colonIdx < 0 || eqIdx < colonIdx) ? eqIdx : colonIdx;
      if (sepIdx >= 0) {
        const keyName = match.slice(0, sepIdx).trim().replace(/"/g, '');
        const keyLower = keyName.toLowerCase();
        if (SAFE_KEY_SUFFIXES.test(keyName)) {
          return match; // Not a secret — config value like TOKEN_EXPIRY
        }
        if (SAFE_KEY_NAMES.has(keyLower)) {
          return match; // Not a secret — schema/config concept like primary_key
        }
        stripped = true;
        return match.slice(0, sepIdx + 1) + ' "REDACTED"';
      }
      stripped = true;
      return '"REDACTED"';
    });
  }

  return { content: modified, stripped };
}

function bootstrapMemory(content: string): string {
  try {
    const data = JSON.parse(content);
    return JSON.stringify(bootstrapObject(data), null, 2);
  } catch {
    // Not valid JSON — return empty structure marker
    return '{}';
  }
}

function bootstrapObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return null; // Strip scalar values
  if (Array.isArray(obj)) return []; // Empty arrays

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recurse into objects — preserve structure, empty values
      result[key] = bootstrapObject(value);
    } else if (Array.isArray(value)) {
      result[key] = [];
    } else {
      // Scalars become null — structure preserved, data removed
      result[key] = null;
    }
  }
  return result;
}

function detectDependencies(files: { path: string; content: string }[]): ExportDependency[] {
  const deps: ExportDependency[] = [];
  const seen = new Set<string>();

  for (const { content, path } of files) {
    // Detect MCP server references
    if (basename(path) === '.mcp.json' || basename(path) === 'mcp.json') {
      try {
        const mcp = JSON.parse(content);
        const servers = mcp.mcpServers || mcp;
        for (const name of Object.keys(servers)) {
          const key = `mcp:${name}`;
          if (!seen.has(key)) {
            seen.add(key);
            deps.push({ type: 'mcp_server', name, required: true });
          }
        }
      } catch {
        // Not parseable
      }
    }

    // Detect npm package references from npx commands
    const npxMatches = content.matchAll(/npx\s+([a-z@][a-z0-9@/_-]*)/gi);
    for (const m of npxMatches) {
      const pkg = m[1];
      const key = `npm:${pkg}`;
      if (!seen.has(key)) {
        seen.add(key);
        deps.push({ type: 'npm_package', name: pkg, required: false });
      }
    }
  }

  return deps;
}

// Known path parameters — excluded from content parameter detection
const PATH_PARAM_NAMES = new Set(PATH_PARAMS.map(([name]) => name));

/**
 * Scan file contents for {{PARAM_NAME}} tokens that are NOT path parameters.
 * Returns a map of parameter name → ContentParameter metadata.
 */
function detectContentParameters(
  files: { bundlePath: string; content: string }[],
): Record<string, ContentParameter> {
  const params: Record<string, ContentParameter> = {};
  // Match {{UPPER_SNAKE_CASE}} tokens — content params use uppercase by convention
  const tokenPattern = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

  for (const { content } of files) {
    for (const match of content.matchAll(tokenPattern)) {
      const token = `{{${match[1]}}}`;
      if (PATH_PARAM_NAMES.has(token)) continue; // skip path params
      if (params[token]) continue; // already found
      params[token] = {
        description: inferParamDescription(match[1]),
        required: true,
        default_value: null,
      };
    }
  }

  return params;
}

/** Generate a human-readable description from a parameter name like OWNER_NAME → "Owner name" */
function inferParamDescription(paramName: string): string {
  return paramName
    .split('_')
    .map((w, i) => i === 0 ? w.charAt(0) + w.slice(1).toLowerCase() : w.toLowerCase())
    .join(' ');
}

/**
 * Generate a draft overview.md from mob metadata and component list.
 */
function generateOverview(
  mob: { name: string; description: string; author: string | null },
  files: ExportFileEntry[],
  contentParams: Record<string, ContentParameter>,
): string {
  const lines: string[] = [];
  lines.push(`# ${mob.name}`);
  lines.push('');
  lines.push(mob.description || 'A mob bundle exported from Whizmob.');
  lines.push('');

  // Components section
  const byType = new Map<string, ExportFileEntry[]>();
  for (const f of files) {
    const type = f.component_type;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(f);
  }

  lines.push('## Components');
  lines.push('');
  for (const [type, entries] of byType) {
    const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`### ${label} (${entries.length})`);
    lines.push('');
    for (const entry of entries) {
      const name = entry.passport_name || entry.bundle_path;
      lines.push(`- **${name}**${entry.role ? ` — ${entry.role}` : ''}`);
    }
    lines.push('');
  }

  // Parameters section
  if (Object.keys(contentParams).length > 0) {
    lines.push('## Parameters');
    lines.push('');
    lines.push('| Parameter | Description |');
    lines.push('|-----------|-------------|');
    for (const [token, meta] of Object.entries(contentParams)) {
      lines.push(`| \`${token}\` | ${meta.description} |`);
    }
    lines.push('');
  }

  // Install section
  lines.push('## Install');
  lines.push('');
  lines.push('```bash');
  lines.push(`npx whizmob import ${mob.name.toLowerCase().replace(/\s+/g, '-')}`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export function exportMob(
  mobName: string,
  options: { outputDir?: string; dryRun?: boolean } = {},
): ExportResult {
  const activeDbPath = resolveDbPath();
  if (!existsSync(activeDbPath)) {
    throw new Error('No database found. Run `whizmob scan` first.');
  }

  const db = new Database(activeDbPath, { readonly: true });
  const warnings: string[] = [];

  try {
    const id = slugify(mobName);

    // Fetch mob
    const mob = db.prepare(`
      SELECT id, name, description, author FROM mobs WHERE id = ?
    `).get(id) as { id: string; name: string; description: string; author: string | null } | undefined;

    if (!mob) {
      throw new Error(`Mob "${mobName}" not found. Use \`whizmob mob list\` to see available mobs.`);
    }

    // Collect all mob IDs in hierarchy (parent + all descendants)
    const allMobIds = collectDescendantIds(db, id);
    allMobIds.add(id);
    const placeholders = [...allMobIds].map(() => '?').join(',');

    // Fetch child mobs for hierarchy metadata
    const childMobs = db.prepare(`
      SELECT mc.child_mob_id, mc.display_order, m.name, m.description
      FROM mob_children mc
      JOIN mobs m ON mc.child_mob_id = m.id
      WHERE mc.parent_mob_id = ?
      ORDER BY mc.display_order, m.name
    `).all(id) as { child_mob_id: string; display_order: number; name: string; description: string }[];

    // Fetch components across all mobs in hierarchy (deduplicated by file path)
    const components = db.prepare(`
      SELECT DISTINCT cc.passport_id, cc.component_type, cc.file_path, cc.role,
             p.name as passport_name, p.source_file as passport_source,
             p.origin, p.author as passport_author, p.license, p.forked_from
      FROM mob_components cc
      LEFT JOIN passports p ON cc.passport_id = p.id
      WHERE cc.mob_id IN (${placeholders})
      ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
    `).all(...allMobIds) as {
      passport_id: string | null;
      component_type: ComponentType;
      file_path: string | null;
      role: string | null;
      passport_name: string | null;
      passport_source: string | null;
      origin: string | null;
      passport_author: string | null;
      license: LicenseType | null;
      forked_from: string | null;
    }[];

    if (components.length === 0) {
      throw new Error(`Mob "${mob.name}" has no components (including sub-mobs). Add some with \`whizmob mob add-component\`.`);
    }

    // Collect files to export
    const filesToExport: {
      absolutePath: string;
      componentType: ComponentType | 'passport_source';
      role: string | null;
      passportName: string | null;
      isMemory: boolean;
      provenance: { origin: string | null; author: string | null; license: LicenseType | null; forked_from: string | null } | undefined;
    }[] = [];

    for (const comp of components) {
      const provenance = comp.passport_id
        ? { origin: comp.origin, author: comp.passport_author, license: comp.license, forked_from: comp.forked_from }
        : undefined;

      if (comp.component_type === 'passport' && comp.passport_source) {
        // Export the passport's source file
        filesToExport.push({
          absolutePath: expandTilde(comp.passport_source),
          componentType: 'passport_source',
          role: comp.role,
          passportName: comp.passport_name,
          isMemory: false,
          provenance,
        });
      } else if (comp.file_path) {
        filesToExport.push({
          absolutePath: expandTilde(comp.file_path),
          componentType: comp.component_type,
          role: comp.role,
          passportName: comp.passport_name,
          isMemory: comp.component_type === 'memory_schema',
          provenance,
        });
      } else {
        warnings.push(`Component ${comp.passport_name || comp.passport_id || '(unknown)'} has no file path — skipped.`);
      }
    }

    // Build bundle
    const bundleDir = options.outputDir || join(DB_DIR, 'exports', id);

    const fileEntries: ExportFileEntry[] = [];
    const rawFiles: { path: string; content: string }[] = [];
    const bundledContents: { bundlePath: string; content: string }[] = [];
    let secretsStripped = 0;
    let memoryBootstrapped = 0;

    for (const file of filesToExport) {
      if (!existsSync(file.absolutePath)) {
        warnings.push(`File not found: ${file.absolutePath} — skipped.`);
        continue;
      }

      let content = readFileSync(file.absolutePath, 'utf-8');
      rawFiles.push({ path: file.absolutePath, content });

      // Secret stripping
      const { content: strippedContent, stripped } = stripSecrets(content, file.absolutePath);
      content = strippedContent;
      if (stripped) secretsStripped++;

      // Memory bootstrapping — export structure only
      let memoryBootstrappedFlag = false;
      if (file.isMemory) {
        content = bootstrapMemory(content);
        memoryBootstrapped++;
        memoryBootstrappedFlag = true;
      }

      // Path rewriting
      const paramPath = parameterizePath(file.absolutePath);

      // Bundle path: files/<component_type>/<contextual_name>
      // For generic filenames (SKILL.md, CLAUDE.md), prefix with parent dir name
      const bundleSubdir = file.componentType;
      const fileName = basename(file.absolutePath);
      const parentDir = basename(dirname(file.absolutePath));
      const GENERIC_NAMES = ['SKILL.md', 'CLAUDE.md', 'README.md', 'index.ts', 'index.js'];
      const contextualName = GENERIC_NAMES.includes(fileName) ? `${parentDir}-${fileName}` : fileName;
      let bundlePath = join('files', bundleSubdir, contextualName);

      // Deduplicate
      let counter = 1;
      const usedPaths = new Set(fileEntries.map(e => e.bundle_path));
      while (usedPaths.has(bundlePath)) {
        const ext = contextualName.includes('.') ? '.' + contextualName.split('.').pop() : '';
        const base = ext ? contextualName.slice(0, -ext.length) : contextualName;
        bundlePath = join('files', bundleSubdir, `${base}-${counter}${ext}`);
        counter++;
      }

      fileEntries.push({
        bundle_path: bundlePath,
        original_path: paramPath,
        component_type: file.componentType,
        role: file.role,
        passport_name: file.passportName,
        secrets_stripped: stripped,
        memory_bootstrapped: memoryBootstrappedFlag,
        provenance: file.provenance,
      });

      // Track content for content parameter detection
      bundledContents.push({ bundlePath, content });

      // Write file to bundle (unless dry-run)
      if (!options.dryRun) {
        const targetPath = join(bundleDir, bundlePath);
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content, 'utf-8');
      }
    }

    // Detect dependencies
    const dependencies = detectDependencies(rawFiles);

    // Detect content parameters ({{UPPER_SNAKE}} tokens in file content)
    const contentParameters = detectContentParameters(bundledContents);

    // Build changelog from previous manifest (if re-exporting to same dir)
    let changelog: ChangelogEntry[] = [];
    let bundleVersion = 1;
    const previousManifestPath = join(bundleDir, 'manifest.json');
    if (existsSync(previousManifestPath)) {
      try {
        const prev: ExportManifest = JSON.parse(readFileSync(previousManifestPath, 'utf-8'));
        changelog = prev.changelog || [];
        bundleVersion = (prev.bundle_version || 1) + 1;

        // Detect what changed since last export using sync engine
        const syncResult = syncMob(bundleDir);
        const changedFiles = syncResult.entries
          .filter(e => e.status === 'modified')
          .map(e => e.passportName || basename(e.originalPath));

        if (changedFiles.length > 0 || fileEntries.length !== prev.files.length) {
          const added = fileEntries.length - prev.files.length;
          const parts: string[] = [];
          if (changedFiles.length > 0) parts.push(`${changedFiles.length} file(s) modified`);
          if (added > 0) parts.push(`${added} file(s) added`);
          if (added < 0) parts.push(`${Math.abs(added)} file(s) removed`);

          changelog.push({
            version: bundleVersion,
            date: new Date().toISOString(),
            summary: parts.join(', '),
            files_changed: changedFiles,
          });
        }
      } catch {
        // Previous manifest unreadable — start fresh
      }
    }

    // Build manifest
    const hierarchy: MobHierarchyEntry[] | undefined = childMobs.length > 0
      ? childMobs.map(c => ({
          id: c.child_mob_id,
          name: c.name,
          description: c.description,
          display_order: c.display_order,
        }))
      : undefined;

    const manifest: ExportManifest = {
      version: '1.0',
      bundle_version: bundleVersion,
      mob: {
        id: mob.id,
        name: mob.name,
        description: mob.description,
        author: mob.author,
      },
      ...(hierarchy ? { hierarchy } : {}),
      exported_at: new Date().toISOString(),
      exported_from: hostname(),
      files: fileEntries,
      dependencies,
      parameters: {
        '{{HOME}}': 'User home directory',
        '{{CLAUDE_DIR}}': 'Claude Code config directory (~/.claude)',
        '{{WHIZMOB_DIR}}': 'Whizmob data directory (~/.whizmob)',
      },
      content_parameters: contentParameters,
      changelog,
    };

    // Generate or validate overview.md
    const overviewPath = join(bundleDir, 'overview.md');
    const existingOverview = existsSync(overviewPath)
      ? readFileSync(overviewPath, 'utf-8')
      : null;

    if (!existingOverview) {
      // Auto-generate a draft overview.md from manifest data
      const overviewContent = generateOverview(mob, fileEntries, contentParameters);
      if (!options.dryRun) {
        mkdirSync(bundleDir, { recursive: true });
        writeFileSync(overviewPath, overviewContent, 'utf-8');
      }
      warnings.push('Auto-generated overview.md — edit it to add context about how this mob works.');
    }

    // Add overview.md to manifest files
    fileEntries.push({
      bundle_path: 'overview.md',
      original_path: 'overview.md',
      component_type: 'documentation',
      role: null,
      passport_name: null,
      secrets_stripped: false,
      memory_bootstrapped: false,
    });

    // Write manifest
    if (!options.dryRun) {
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(
        join(bundleDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8',
      );

      // Write .gitignore for clean git transfer
      writeFileSync(
        join(bundleDir, '.gitignore'),
        '# Whizmob export bundle\n*.db\n.DS_Store\n',
        'utf-8',
      );
    }

    return {
      bundleDir,
      manifest,
      fileCount: fileEntries.length,
      secretsStripped,
      memoryBootstrapped,
      contentParamsDetected: Object.keys(contentParameters).length,
      warnings,
    };
  } finally {
    db.close();
  }
}
