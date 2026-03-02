import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import type { ExportManifest, ExportFileEntry } from './export.js';
import { loadFullProfile, saveImportProfile, resolveBundlePath } from './import.js';

const DEFAULT_PARAMS: Record<string, string> = {
  '{{HOME}}': homedir(),
  '{{CLAUDE_DIR}}': join(homedir(), '.claude'),
  '{{WHIZMOB_DIR}}': join(homedir(), '.whizmob'),
};

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

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Substitute content parameters in file content. */
function substituteContentParams(
  content: string,
  subs: Record<string, string>,
): string {
  let result = content;
  for (const [token, value] of Object.entries(subs)) {
    result = result.split(token).join(value);
  }
  return result;
}

/** Reverse-substitute content parameters: replace concrete values with tokens. */
function reverseSubstitute(
  content: string,
  subs: Record<string, string>,
): string {
  let result = content;
  for (const [token, value] of Object.entries(subs)) {
    if (value) {
      result = result.split(value).join(token);
    }
  }
  return result;
}

export type ChangeClass = 'unchanged' | 'upstream-only' | 'local-only' | 'both-changed' | 'new-file' | 'missing-bundle';

export interface UpdateFileAction {
  file: ExportFileEntry;
  targetPath: string;
  classification: ChangeClass;
  /** Simple diff showing what changed (for both-changed files) */
  diff?: string;
}

export interface UpdatePlan {
  manifest: ExportManifest;
  actions: UpdateFileAction[];
  autoApply: number;
  localOnly: number;
  conflicts: number;
  newFiles: number;
  unchanged: number;
  warnings: string[];
}

export interface UpdateResult {
  applied: number;
  skipped: number;
  conflicts: number;
  newFiles: number;
  warnings: string[];
}

/**
 * Plan an update by classifying each file using three-way comparison:
 *
 * 1. Hash of bundle content at last import time (stored in profile)
 * 2. Current local file content (reverse-substituted to canonical form)
 * 3. New bundle content
 *
 * Classification:
 * - unchanged: local == stored hash AND new bundle == stored hash
 * - upstream-only: local == stored hash AND new bundle != stored hash → safe to auto-apply
 * - local-only: local != stored hash AND new bundle == stored hash → skip (user's edits)
 * - both-changed: local != stored hash AND new bundle != stored hash → conflict
 * - new-file: no stored hash (first import of this file)
 */
export function planUpdate(bundlePath: string): UpdatePlan {
  const manifestPath = join(bundlePath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${bundlePath}. Is this a valid Whizmob export bundle?`);
  }

  const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const mobMeta = manifest.mob || (manifest as unknown as { constellation: ExportManifest['mob'] }).constellation;
  const mobId = mobMeta.id;

  const profile = loadFullProfile(mobId);
  const fileHashes: Record<string, string> = profile.file_hashes || {};
  const resolvedParams = { ...DEFAULT_PARAMS, ...profile.params };
  const warnings: string[] = [];

  // Build content substitution map (only content params, not path params)
  const contentSubs: Record<string, string> = {};
  for (const [token, value] of Object.entries(profile.params)) {
    if (!Object.keys(DEFAULT_PARAMS).includes(token)) {
      contentSubs[token] = value;
    }
  }

  const actions: UpdateFileAction[] = [];
  let autoApply = 0;
  let localOnly = 0;
  let conflicts = 0;
  let newFiles = 0;
  let unchanged = 0;

  for (const file of manifest.files) {
    const targetPath = deparameterizePath(file.original_path, resolvedParams);
    const bundleFilePath = join(bundlePath, file.bundle_path);

    if (!existsSync(bundleFilePath)) {
      actions.push({ file, targetPath, classification: 'missing-bundle' });
      warnings.push(`Bundle file missing: ${file.bundle_path}`);
      continue;
    }

    const newBundleContent = readFileSync(bundleFilePath, 'utf-8');
    const newBundleHash = hashContent(newBundleContent);
    const storedHash = fileHashes[file.bundle_path];

    // No stored hash → this is a new file (added to bundle since last import)
    if (!storedHash) {
      actions.push({ file, targetPath, classification: 'new-file' });
      newFiles++;
      continue;
    }

    // Check if local file exists
    if (!existsSync(targetPath)) {
      // Local file was deleted — treat as local-only change
      actions.push({ file, targetPath, classification: 'local-only' });
      localOnly++;
      warnings.push(`Local file deleted: ${targetPath}`);
      continue;
    }

    // Read local file and reverse-substitute to get canonical form
    const localContent = readFileSync(targetPath, 'utf-8');
    const canonicalLocal = Object.keys(contentSubs).length > 0
      ? reverseSubstitute(localContent, contentSubs)
      : localContent;
    const localHash = hashContent(canonicalLocal);

    const localChanged = localHash !== storedHash;
    const upstreamChanged = newBundleHash !== storedHash;

    if (!localChanged && !upstreamChanged) {
      actions.push({ file, targetPath, classification: 'unchanged' });
      unchanged++;
    } else if (!localChanged && upstreamChanged) {
      actions.push({ file, targetPath, classification: 'upstream-only' });
      autoApply++;
    } else if (localChanged && !upstreamChanged) {
      actions.push({ file, targetPath, classification: 'local-only' });
      localOnly++;
    } else {
      // Both changed — generate a diff
      const diff = generateDiff(canonicalLocal, newBundleContent, file.passport_name || basename(targetPath));
      actions.push({ file, targetPath, classification: 'both-changed', diff });
      conflicts++;
    }
  }

  return { manifest, actions, autoApply, localOnly, conflicts, newFiles, unchanged, warnings };
}

/**
 * Execute an update plan: apply upstream-only and new files,
 * optionally force-apply conflicts.
 */
export function executeUpdate(
  bundlePath: string,
  plan: UpdatePlan,
  options: { force?: boolean; applyNew?: boolean } = {},
): UpdateResult {
  const profile = loadFullProfile(plan.manifest.mob.id);
  const resolvedParams = { ...DEFAULT_PARAMS, ...profile.params };
  const warnings: string[] = [];

  // Build content substitution map
  const contentSubs: Record<string, string> = {};
  for (const [token, value] of Object.entries(profile.params)) {
    if (!Object.keys(DEFAULT_PARAMS).includes(token)) {
      contentSubs[token] = value;
    }
  }

  const fileHashes: Record<string, string> = profile.file_hashes || {};
  let applied = 0;
  let skipped = 0;
  let conflictsSkipped = 0;
  let newFilesApplied = 0;

  for (const action of plan.actions) {
    const bundleFilePath = join(bundlePath, action.file.bundle_path);

    if (action.classification === 'upstream-only') {
      // Safe to auto-apply
      const content = readBundleAndSubstitute(bundleFilePath, contentSubs);
      mkdirSync(join(action.targetPath, '..'), { recursive: true });
      writeFileSync(action.targetPath, content, 'utf-8');
      // Update stored hash to new bundle content
      fileHashes[action.file.bundle_path] = hashContent(readFileSync(bundleFilePath, 'utf-8'));
      applied++;
    } else if (action.classification === 'new-file') {
      if (options.applyNew !== false) {
        const content = readBundleAndSubstitute(bundleFilePath, contentSubs);
        mkdirSync(join(action.targetPath, '..'), { recursive: true });
        writeFileSync(action.targetPath, content, 'utf-8');
        fileHashes[action.file.bundle_path] = hashContent(readFileSync(bundleFilePath, 'utf-8'));
        newFilesApplied++;
        applied++;
      } else {
        skipped++;
      }
    } else if (action.classification === 'both-changed') {
      if (options.force) {
        const content = readBundleAndSubstitute(bundleFilePath, contentSubs);
        writeFileSync(action.targetPath, content, 'utf-8');
        fileHashes[action.file.bundle_path] = hashContent(readFileSync(bundleFilePath, 'utf-8'));
        applied++;
      } else {
        conflictsSkipped++;
        skipped++;
      }
    } else {
      // unchanged, local-only, missing-bundle → skip
      skipped++;
    }
  }

  // Update profile with new hashes and version
  const updatedProfile = {
    ...profile,
    file_hashes: fileHashes,
    last_imported_version: plan.manifest.bundle_version,
  };
  saveFullProfile(plan.manifest.mob.id, updatedProfile);

  return { applied, skipped, conflicts: conflictsSkipped, newFiles: newFilesApplied, warnings };
}

function readBundleAndSubstitute(bundleFilePath: string, subs: Record<string, string>): string {
  let content = readFileSync(bundleFilePath, 'utf-8');
  if (Object.keys(subs).length > 0) {
    content = substituteContentParams(content, subs);
  }
  return content;
}

function generateDiff(oldContent: string, newContent: string, fileName: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: string[] = [`--- local/${fileName}`, `+++ upstream/${fileName}`];

  const maxLines = Math.max(oldLines.length, newLines.length);
  let diffCount = 0;
  const MAX_DIFF_LINES = 30;

  for (let i = 0; i < maxLines; i++) {
    if (diffCount >= MAX_DIFF_LINES) {
      lines.push(`  ... (${maxLines - i} more lines)`);
      break;
    }
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === newLine) continue;
    if (oldLine !== undefined && newLine !== undefined) {
      lines.push(`- ${oldLine}`);
      lines.push(`+ ${newLine}`);
      diffCount += 2;
    } else if (oldLine !== undefined) {
      lines.push(`- ${oldLine}`);
      diffCount++;
    } else {
      lines.push(`+ ${newLine}`);
      diffCount++;
    }
  }

  return lines.join('\n');
}

/**
 * Compute file hashes for a bundle's files (pre-substitution content).
 * Called during initial import to populate the profile.
 */
export function computeBundleHashes(bundlePath: string, manifest: ExportManifest): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of manifest.files) {
    const filePath = join(bundlePath, file.bundle_path);
    if (existsSync(filePath)) {
      hashes[file.bundle_path] = hashContent(readFileSync(filePath, 'utf-8'));
    }
  }
  return hashes;
}

/**
 * Pull latest changes from a git-based bundle directory.
 */
export function pullBundle(bundlePath: string): boolean {
  try {
    execSync('git pull', { cwd: bundlePath, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Extended profile with file hashes
interface FullProfileWithHashes {
  params: Record<string, string>;
  last_imported_version: number | null;
  file_hashes: Record<string, string>;
}

function saveFullProfile(mobId: string, profile: FullProfileWithHashes): void {
  const dir = process.env.WHIZMOB_PROFILES_DIR || join(homedir(), '.whizmob', 'import-profiles');
  mkdirSync(dir, { recursive: true });
  const profilePath = join(dir, `${mobId}.json`);
  writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
}
