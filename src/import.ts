import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { ExportManifest, ExportFileEntry } from './export.js';

// Default parameter values for the current machine
const DEFAULT_PARAMS: Record<string, string> = {
  '{{HOME}}': homedir(),
  '{{CLAUDE_DIR}}': join(homedir(), '.claude'),
  '{{RONIN_DIR}}': join(homedir(), '.ronin'),
};

export interface ImportPlan {
  manifest: ExportManifest;
  actions: ImportAction[];
  dependencies: DependencyCheck[];
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
    // Check if globally available
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
    throw new Error(`No manifest.json found in ${bundlePath}. Is this a valid Ronin export bundle?`);
  }

  const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  if (manifest.version !== '1.0') {
    throw new Error(`Unsupported bundle version: ${manifest.version}. This version of Ronin supports version 1.0.`);
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

  return { manifest, actions, dependencies, warnings };
}

export interface ImportResult {
  installed: number;
  skipped: number;
  conflicts: number;
  warnings: string[];
}

export function executeImport(
  bundlePath: string,
  plan: ImportPlan,
  options: { force?: boolean } = {},
): ImportResult {
  let installed = 0;
  let skipped = 0;
  let conflicts = 0;
  const warnings: string[] = [...plan.warnings];

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

    const content = readFileSync(sourcePath, 'utf-8');

    // Create target directory
    mkdirSync(dirname(action.targetPath), { recursive: true });

    // Write file
    writeFileSync(action.targetPath, content, 'utf-8');
    installed++;
  }

  return { installed, skipped, conflicts, warnings };
}
