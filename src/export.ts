import Database from 'better-sqlite3';
import { join, relative, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { slugify } from './constellation.js';
import type { ComponentType, LicenseType } from './types.js';

const DB_DIR = join(homedir(), '.ronin');
const DB_PATH = join(DB_DIR, 'ronin.db');

// Path parameters for portability
const PATH_PARAMS: [string, string][] = [
  // Order matters — most specific first
  ['{{CLAUDE_DIR}}', join(homedir(), '.claude')],
  ['{{RONIN_DIR}}', DB_DIR],
  ['{{HOME}}', homedir()],
];

export interface ExportManifest {
  version: '1.0';
  constellation: {
    id: string;
    name: string;
    description: string;
    author: string | null;
  };
  exported_at: string;
  exported_from: string; // machine hostname
  files: ExportFileEntry[];
  dependencies: ExportDependency[];
  parameters: Record<string, string>; // param name → description
}

export interface ExportFileEntry {
  /** Relative path within the bundle */
  bundle_path: string;
  /** Parameterized original path (e.g. {{CLAUDE_DIR}}/skills/foo/SKILL.md) */
  original_path: string;
  /** Component type from the constellation */
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
  warnings: string[];
}

// Patterns that indicate secrets
const SECRET_PATTERNS = [
  /(?:password|secret|token|key|credential|api_key|apikey|private_key)\s*[:=]\s*.+/gi,
  /"(?:password|secret|token|key|credential|api_key|apikey|private_key)"\s*:\s*"[^"]+"/gi,
  /sk[-_][a-zA-Z0-9]{20,}/g, // Stripe-style keys
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub PATs
  /xoxb-[a-zA-Z0-9-]+/g, // Slack bot tokens
];

// Env var reference pattern
const ENV_REF_PATTERN = /(?:process\.env\.)([A-Z_]+)/g;

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

function stripSecrets(content: string, filePath: string): { content: string; stripped: boolean } {
  let modified = content;
  let stripped = false;

  // For .mcp.json files, redact env blocks
  if (basename(filePath) === '.mcp.json' || basename(filePath) === 'mcp.json') {
    modified = modified.replace(/"env"\s*:\s*\{[^}]*\}/g, (match) => {
      stripped = true;
      return '"env": { "REDACTED": "Set during import" }';
    });
  }

  // For settings.json, redact sensitive fields
  if (basename(filePath) === 'settings.json') {
    modified = modified.replace(/"(?:password|secret|token|key|credential)[^"]*"\s*:\s*"[^"]*"/gi, (match) => {
      stripped = true;
      const key = match.split(':')[0];
      return `${key}: "REDACTED"`;
    });
  }

  // General secret pattern stripping for any file
  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const before = modified;
    modified = modified.replace(regex, (match) => {
      stripped = true;
      // Keep the key name but redact the value
      const eqIdx = match.indexOf('=');
      const colonIdx = match.indexOf(':');
      const sepIdx = eqIdx >= 0 && (colonIdx < 0 || eqIdx < colonIdx) ? eqIdx : colonIdx;
      if (sepIdx >= 0) {
        return match.slice(0, sepIdx + 1) + ' "REDACTED"';
      }
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
        for (const [name, config] of Object.entries(servers)) {
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

export function exportConstellation(
  constellationName: string,
  options: { outputDir?: string; dryRun?: boolean } = {},
): ExportResult {
  if (!existsSync(DB_PATH)) {
    throw new Error('No Ronin database found. Run `ronin scan` first.');
  }

  const db = new Database(DB_PATH, { readonly: true });
  const warnings: string[] = [];

  try {
    const id = slugify(constellationName);

    // Fetch constellation
    const constellation = db.prepare(`
      SELECT id, name, description, author FROM constellations WHERE id = ?
    `).get(id) as { id: string; name: string; description: string; author: string | null } | undefined;

    if (!constellation) {
      throw new Error(`Constellation "${constellationName}" not found. Use \`ronin constellation list\` to see available constellations.`);
    }

    // Fetch components with passport details and provenance
    const components = db.prepare(`
      SELECT cc.passport_id, cc.component_type, cc.file_path, cc.role,
             p.name as passport_name, p.source_file as passport_source,
             p.origin, p.author as passport_author, p.license, p.forked_from
      FROM constellation_components cc
      LEFT JOIN passports p ON cc.passport_id = p.id
      WHERE cc.constellation_id = ?
      ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
    `).all(id) as {
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
      throw new Error(`Constellation "${constellation.name}" has no components. Add some with \`ronin constellation add-component\`.`);
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
    const filesDir = join(bundleDir, 'files');

    const fileEntries: ExportFileEntry[] = [];
    const rawFiles: { path: string; content: string }[] = [];
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

      // Write file to bundle (unless dry-run)
      if (!options.dryRun) {
        const targetPath = join(bundleDir, bundlePath);
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content, 'utf-8');
      }
    }

    // Detect dependencies
    const dependencies = detectDependencies(rawFiles);

    // Build manifest
    const manifest: ExportManifest = {
      version: '1.0',
      constellation: {
        id: constellation.id,
        name: constellation.name,
        description: constellation.description,
        author: constellation.author,
      },
      exported_at: new Date().toISOString(),
      exported_from: hostname(),
      files: fileEntries,
      dependencies,
      parameters: {
        '{{HOME}}': 'User home directory',
        '{{CLAUDE_DIR}}': 'Claude Code config directory (~/.claude)',
        '{{RONIN_DIR}}': 'Ronin data directory (~/.ronin)',
      },
    };

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
        '# Ronin export bundle\n*.db\n.DS_Store\n',
        'utf-8',
      );
    }

    return {
      bundleDir,
      manifest,
      fileCount: fileEntries.length,
      secretsStripped,
      memoryBootstrapped,
      warnings,
    };
  } finally {
    db.close();
  }
}
