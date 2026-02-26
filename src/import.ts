import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { ExportManifest, ExportFileEntry, ContentParameter } from './export.js';

// Default parameter values for the current machine
const DEFAULT_PARAMS: Record<string, string> = {
  '{{HOME}}': homedir(),
  '{{CLAUDE_DIR}}': join(homedir(), '.claude'),
  '{{WHIZMOB_DIR}}': join(homedir(), '.whizmob'),
};

function resolveProfilesDir(): string {
  const override = process.env.WHIZMOB_PROFILES_DIR;
  if (override) return override;
  return join(homedir(), '.whizmob', 'import-profiles');
}

/**
 * Load a saved import profile for a constellation.
 * Returns the saved content param values, or empty object if none.
 */
export function loadImportProfile(constellationId: string): Record<string, string> {
  const profilePath = join(resolveProfilesDir(), `${constellationId}.json`);
  if (!existsSync(profilePath)) return {};
  try {
    return JSON.parse(readFileSync(profilePath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save resolved content params as an import profile for future re-imports.
 */
export function saveImportProfile(constellationId: string, params: Record<string, string>): void {
  const dir = resolveProfilesDir();
  mkdirSync(dir, { recursive: true });
  const profilePath = join(dir, `${constellationId}.json`);
  writeFileSync(profilePath, JSON.stringify(params, null, 2), 'utf-8');
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

function deparameterizePath(paramPath: string, params: Record<string, string>): string {
  let result = paramPath;
  for (const [param, value] of Object.entries(params)) {
    if (result.includes(param)) {
      result = result.replace(param, value);
    }
  }
  return result;
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

  return { installed, skipped, conflicts, provenanceRecorded, contentParamsApplied, warnings };
}
