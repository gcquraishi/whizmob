import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import type { ExportManifest, ExportFileEntry, ContentParameter, MobHierarchyEntry } from './export.js';
import { SCHEMA, TABLE_MIGRATIONS } from './schema.js';

const __importDirname = dirname(fileURLToPath(import.meta.url));

// Default parameter values for the current machine
const DEFAULT_PARAMS: Record<string, string> = {
  '{{HOME}}': homedir(),
  '{{CLAUDE_DIR}}': join(homedir(), '.claude'),
  '{{WHIZMOB_DIR}}': join(homedir(), '.whizmob'),
};

/**
 * Resolve a bundle argument to a filesystem path.
 * If the argument looks like a path (contains / ~ or .), treat it as-is.
 * Otherwise, look for a named bundle in <package-root>/exports/<name>/.
 */
export function resolveBundlePath(bundleArg: string): { path: string; named: boolean } {
  // Looks like a filesystem path — pass through
  if (bundleArg.includes('/') || bundleArg.startsWith('~') || bundleArg.startsWith('.')) {
    const resolved = bundleArg.startsWith('~')
      ? join(homedir(), bundleArg.slice(1))
      : bundleArg;
    return { path: resolved, named: false };
  }

  // Try to resolve as a named bundle from <package-root>/exports/
  const packageRoot = join(__importDirname, '..');
  const namedPath = join(packageRoot, 'exports', bundleArg);
  const manifestPath = join(namedPath, 'manifest.json');
  if (existsSync(manifestPath)) {
    return { path: namedPath, named: true };
  }

  // Fall back to treating as relative path (existing error handling will fire)
  return { path: bundleArg, named: false };
}

/**
 * List all bundled exports shipped with the package.
 * Reads exports/{name}/manifest.json from the package root.
 */
export function listBundledExports(): Array<{ name: string; id: string; version: number; description: string; summary: string; hierarchy?: MobHierarchyEntry[] }> {
  const exportsDir = join(__importDirname, '..', 'exports');
  if (!existsSync(exportsDir)) return [];

  const results: Array<{ name: string; id: string; version: number; description: string; summary: string; hierarchy?: MobHierarchyEntry[] }> = [];
  let entries: string[];
  try {
    entries = readdirSync(exportsDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    const manifestPath = join(exportsDir, entry, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const mobMeta = manifest.mob || (manifest as any).constellation;

      // Read one-line summary from overview.md (first non-heading, non-empty line)
      let summary = '';
      const overviewPath = join(exportsDir, entry, 'overview.md');
      if (existsSync(overviewPath)) {
        const overviewContent = readFileSync(overviewPath, 'utf-8');
        const lines = overviewContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            summary = trimmed;
            break;
          }
        }
      }

      results.push({
        name: mobMeta.name,
        id: entry,
        version: manifest.bundle_version,
        description: mobMeta.description || '',
        summary,
        hierarchy: manifest.hierarchy,
      });
    } catch {
      // Skip malformed manifests
    }
  }

  return results;
}

function resolveProfilesDir(): string {
  const override = process.env.WHIZMOB_PROFILES_DIR;
  if (override) return override;
  return join(homedir(), '.whizmob', 'import-profiles');
}

export interface ImportProfile {
  params: Record<string, string>;
  last_imported_version: number | null;
  file_hashes?: Record<string, string>;
}

/**
 * Load a saved import profile for a mob.
 * Handles both v1 (flat params object) and v2 (structured with version) formats.
 */
export function loadImportProfile(mobId: string): Record<string, string> {
  const profilePath = join(resolveProfilesDir(), `${mobId}.json`);
  if (!existsSync(profilePath)) return {};
  try {
    const data = JSON.parse(readFileSync(profilePath, 'utf-8'));
    // v2 format: { params: {...}, last_imported_version: N }
    if (data.params && typeof data.params === 'object') return data.params;
    // v1 format: flat { "{{TOKEN}}": "value" } — backwards compatible
    return data;
  } catch {
    return {};
  }
}

/**
 * Load the full profile including version metadata.
 */
export function loadFullProfile(mobId: string): ImportProfile {
  const profilePath = join(resolveProfilesDir(), `${mobId}.json`);
  if (!existsSync(profilePath)) return { params: {}, last_imported_version: null };
  try {
    const data = JSON.parse(readFileSync(profilePath, 'utf-8'));
    if (data.params && typeof data.params === 'object') {
      return {
        params: data.params,
        last_imported_version: data.last_imported_version ?? null,
        file_hashes: data.file_hashes ?? undefined,
      };
    }
    // v1 format migration
    return { params: data, last_imported_version: null };
  } catch {
    return { params: {}, last_imported_version: null };
  }
}

/**
 * Save resolved content params and version as an import profile for future re-imports.
 */
export function saveImportProfile(
  mobId: string,
  params: Record<string, string>,
  bundleVersion?: number,
  fileHashes?: Record<string, string>,
): void {
  const dir = resolveProfilesDir();
  mkdirSync(dir, { recursive: true });
  const profilePath = join(dir, `${mobId}.json`);
  const profile: ImportProfile = {
    params,
    last_imported_version: bundleVersion ?? null,
    file_hashes: fileHashes,
  };
  writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
}

export interface ContentParamStatus {
  token: string;
  meta: ContentParameter;
  resolved: boolean;
  value: string | null;
}

export interface ImportPlan {
  manifest: ExportManifest;
  actions: ImportAction[];
  dependencies: DependencyCheck[];
  contentParams: ContentParamStatus[];
  warnings: string[];
}

export interface ImportAction {
  file: ExportFileEntry;
  /** Resolved absolute target path */
  targetPath: string;
  /** Whether the target already exists */
  conflict: boolean;
  /** Whether this file had secrets stripped (needs manual config) */
  needsSecrets: boolean;
  /** Whether this is a bootstrapped memory schema */
  isBootstrapped: boolean;
}

export interface DependencyCheck {
  type: string;
  name: string;
  required: boolean;
  /** Whether the dependency appears to be available */
  available: boolean;
}

function expandTilde(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

function deparameterizePath(paramPath: string, params: Record<string, string>): string {
  let result = paramPath;
  for (const [param, value] of Object.entries(params)) {
    if (result.includes(param)) {
      result = result.replace(param, value);
    }
  }
  return expandTilde(result);
}

function checkDependency(dep: { type: string; name: string }): boolean {
  if (dep.type === 'mcp_server') {
    // Check if MCP config references this server
    const mcpPath = join(homedir(), '.claude', '.mcp.json');
    if (existsSync(mcpPath)) {
      try {
        const content = readFileSync(mcpPath, 'utf-8');
        const mcp = JSON.parse(content);
        const servers = mcp.mcpServers || mcp;
        return dep.name in servers;
      } catch {
        return false;
      }
    }
    return false;
  }

  if (dep.type === 'npm_package') {
    // Validate name before passing to shell to prevent command injection
    if (!/^[a-z@][a-z0-9@/_.-]*$/i.test(dep.name)) {
      return false;
    }
    try {
      execSync(`which ${dep.name} 2>/dev/null || npm list -g ${dep.name} 2>/dev/null`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function planImport(
  bundlePath: string,
  params?: Record<string, string>,
): ImportPlan {
  const manifestPath = join(bundlePath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${bundlePath}. Is this a valid Whizmob export bundle?`);
  }

  const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  if (manifest.version !== '1.0') {
    throw new Error(`Unsupported bundle version: ${manifest.version}. This version of Whizmob supports version 1.0.`);
  }

  const resolvedParams = { ...DEFAULT_PARAMS, ...params };
  const warnings: string[] = [];
  const actions: ImportAction[] = [];

  for (const file of manifest.files) {
    // Documentation files (overview.md) are bundle-level docs, not installable
    if (file.component_type === 'documentation') continue;

    const targetPath = deparameterizePath(file.original_path, resolvedParams);
    const conflict = existsSync(targetPath);
    const needsSecrets = file.secrets_stripped;
    const isBootstrapped = file.memory_bootstrapped;

    if (conflict) {
      warnings.push(`File exists: ${targetPath} — will be overwritten.`);
    }
    if (needsSecrets) {
      warnings.push(`${file.bundle_path} had secrets stripped — you'll need to configure credentials after import.`);
    }

    actions.push({
      file,
      targetPath,
      conflict,
      needsSecrets,
      isBootstrapped,
    });
  }

  // Check dependencies
  const dependencies: DependencyCheck[] = manifest.dependencies.map(dep => ({
    ...dep,
    available: checkDependency(dep),
  }));

  const missingRequired = dependencies.filter(d => d.required && !d.available);
  for (const dep of missingRequired) {
    warnings.push(`Required dependency missing: ${dep.type} "${dep.name}"`);
  }

  // Validate --param keys against manifest
  const manifestContentParams = manifest.content_parameters || {};
  const validTokens = new Set([
    ...Object.keys(manifestContentParams),
    ...Object.keys(DEFAULT_PARAMS),
  ]);
  if (params) {
    for (const key of Object.keys(params)) {
      if (!validTokens.has(key)) {
        warnings.push(`Unknown parameter ${key} — not defined in manifest. Valid content parameters: ${Object.keys(manifestContentParams).join(', ') || '(none)'}`);
      }
    }
  }

  // Resolve content parameters
  const contentParams: ContentParamStatus[] = [];
  for (const [token, meta] of Object.entries(manifestContentParams)) {
    const userValue = resolvedParams[token] ?? null;
    const resolved = userValue !== null;
    if (!resolved && meta.required) {
      warnings.push(`Required content parameter ${token} not provided. Use --param '${token}=<value>'`);
    }
    contentParams.push({
      token,
      meta,
      resolved,
      value: userValue ?? meta.default_value,
    });
  }

  return { manifest, actions, dependencies, contentParams, warnings };
}

export interface ImportResult {
  installed: number;
  skipped: number;
  conflicts: number;
  provenanceRecorded: number;
  contentParamsApplied: number;
  fileHashes: Record<string, string>;
  warnings: string[];
}

/**
 * Build a substitution map from resolved content parameters.
 * Only includes params that have a non-null value.
 */
function buildContentSubstitutions(contentParams: ContentParamStatus[]): Record<string, string> {
  const subs: Record<string, string> = {};
  for (const cp of contentParams) {
    if (cp.value !== null) {
      subs[cp.token] = cp.value;
    }
  }
  return subs;
}

/**
 * Apply content parameter substitution to file content.
 * Replaces all {{PARAM}} tokens with their resolved values.
 * Returns the substituted content and count of substitutions made.
 */
function substituteContentParams(
  content: string,
  subs: Record<string, string>,
): { content: string; count: number } {
  let result = content;
  let count = 0;
  for (const [token, value] of Object.entries(subs)) {
    // Count occurrences before replacing
    const occurrences = result.split(token).length - 1;
    if (occurrences > 0) {
      result = result.split(token).join(value);
      count += occurrences;
    }
  }
  return { content: result, count };
}

export function executeImport(
  bundlePath: string,
  plan: ImportPlan,
  options: { force?: boolean } = {},
): ImportResult {
  let installed = 0;
  let skipped = 0;
  let conflicts = 0;
  let provenanceRecorded = 0;
  let contentParamsApplied = 0;
  const warnings: string[] = [...plan.warnings];

  // Track file hashes for the import profile (pre-substitution content)
  const fileHashes: Record<string, string> = {};

  // Build content substitution map from resolved params
  const contentSubs = buildContentSubstitutions(plan.contentParams);

  for (const action of plan.actions) {
    if (action.conflict && !options.force) {
      conflicts++;
      skipped++;
      continue;
    }

    const sourcePath = join(bundlePath, action.file.bundle_path);
    if (!existsSync(sourcePath)) {
      warnings.push(`Bundle file missing: ${action.file.bundle_path} — skipped.`);
      skipped++;
      continue;
    }

    let content = readFileSync(sourcePath, 'utf-8');

    // Store hash of pre-substitution content for future update comparisons
    fileHashes[action.file.bundle_path] = createHash('sha256').update(content).digest('hex');

    // Apply content parameter substitution
    if (Object.keys(contentSubs).length > 0) {
      const { content: substituted, count } = substituteContentParams(content, contentSubs);
      content = substituted;
      contentParamsApplied += count;
    }

    // Create target directory
    mkdirSync(dirname(action.targetPath), { recursive: true });

    // Write file
    writeFileSync(action.targetPath, content, 'utf-8');
    installed++;
  }

  // Record provenance in Whizmob DB for imported passports
  const dbPath = process.env.WHIZMOB_DB_PATH || join(homedir(), '.whizmob', 'whizmob.db');
  if (existsSync(dbPath)) {
    try {
      const db = new Database(dbPath);
      try {
        const updateProvenance = db.prepare(`
          UPDATE passports SET
            origin = COALESCE(?, origin),
            author = COALESCE(?, author),
            license = COALESCE(?, license),
            forked_from = COALESCE(?, forked_from)
          WHERE source_file LIKE ? ESCAPE '|'
        `);

        for (const action of plan.actions) {
          const prov = action.file.provenance;
          if (prov && (prov.origin || prov.author || prov.license || prov.forked_from)) {
            // Match by the target path (which becomes the source_file after next scan)
            const pathSuffix = action.targetPath.split('/').slice(-2).join('/');
            const escaped = pathSuffix.replace(/[|%_]/g, (ch) => `|${ch}`);
            const sourcePattern = `%${escaped}%`;
            const result = updateProvenance.run(
              prov.origin, prov.author, prov.license, prov.forked_from,
              sourcePattern,
            );
            if (result.changes > 0) provenanceRecorded++;
          }
        }
      } finally {
        db.close();
      }
    } catch {
      warnings.push('Could not record provenance — database may be locked or unavailable.');
    }
  }

  // Create mob hierarchy in DB if manifest includes hierarchy
  if (plan.manifest.hierarchy && plan.manifest.hierarchy.length > 0) {
    const dbPath = process.env.WHIZMOB_DB_PATH || join(homedir(), '.whizmob', 'whizmob.db');
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath);
        try {
          // Ensure mob_children table exists
          try { db.exec(TABLE_MIGRATIONS); } catch { /* already exists */ }

          const mobMeta = plan.manifest.mob;

          // Upsert parent mob
          db.prepare(`
            INSERT INTO mobs (id, name, description, author) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description
          `).run(mobMeta.id, mobMeta.name, mobMeta.description, mobMeta.author);

          // Create sub-mobs and hierarchy relationships
          const insertMob = db.prepare(`
            INSERT INTO mobs (id, name, description) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description
          `);
          const insertChild = db.prepare(`
            INSERT OR REPLACE INTO mob_children (parent_mob_id, child_mob_id, display_order)
            VALUES (?, ?, ?)
          `);

          for (const sub of plan.manifest.hierarchy) {
            insertMob.run(sub.id, sub.name, sub.description);
            insertChild.run(mobMeta.id, sub.id, sub.display_order);
          }

          // Assign components to sub-mobs based on manifest file entries
          const insertComp = db.prepare(`
            INSERT OR IGNORE INTO mob_components (mob_id, passport_id, component_type, file_path)
            VALUES (?, ?, ?, ?)
          `);

          for (const action of plan.actions) {
            const file = action.file;
            if (file.sub_mobs && file.sub_mobs.length > 0) {
              for (const subMobId of file.sub_mobs) {
                // Try to find passport by name
                const passport = file.passport_name
                  ? db.prepare('SELECT id FROM passports WHERE name = ?').get(file.passport_name) as { id: string } | undefined
                  : undefined;
                insertComp.run(
                  subMobId,
                  passport?.id || null,
                  file.component_type === 'passport_source' ? 'passport' : file.component_type,
                  passport ? null : action.targetPath,
                );
              }
            }
          }
        } finally {
          db.close();
        }
      } catch {
        warnings.push('Could not create mob hierarchy — database may be locked or unavailable.');
      }
    }
  }

  return { installed, skipped, conflicts, provenanceRecorded, contentParamsApplied, fileHashes, warnings };
}
