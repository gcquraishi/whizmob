import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { ExportManifest } from './export.js';

const HOME = homedir();

// Reverse parameterization
const PARAM_VALUES: Record<string, string> = {
  '{{HOME}}': HOME,
  '{{CLAUDE_DIR}}': join(HOME, '.claude'),
  '{{RONIN_DIR}}': join(HOME, '.ronin'),
};

function deparameterize(paramPath: string): string {
  let result = paramPath;
  for (const [param, value] of Object.entries(PARAM_VALUES)) {
    if (result.includes(param)) {
      result = result.replace(param, value);
    }
  }
  return result;
}

export interface SyncEntry {
  bundlePath: string;
  originalPath: string;
  resolvedPath: string;
  passportName: string | null;
  status: 'unchanged' | 'modified' | 'missing_source' | 'missing_bundle';
  diff?: string;
}

export interface SyncResult {
  constellation: string;
  exportedAt: string;
  exportedFrom: string;
  entries: SyncEntry[];
  unchanged: number;
  modified: number;
  missingSrc: number;
  missingBundle: number;
}

export function syncConstellation(bundlePath: string): SyncResult {
  const manifestPath = join(bundlePath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest.json found in ${bundlePath}. Is this a valid Ronin export bundle?`);
  }

  const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const entries: SyncEntry[] = [];
  let unchanged = 0;
  let modified = 0;
  let missingSrc = 0;
  let missingBundle = 0;

  for (const file of manifest.files) {
    const resolvedPath = deparameterize(file.original_path);
    const bundleFilePath = join(bundlePath, file.bundle_path);

    // Check if source file exists
    if (!existsSync(resolvedPath)) {
      entries.push({
        bundlePath: file.bundle_path,
        originalPath: file.original_path,
        resolvedPath,
        passportName: file.passport_name,
        status: 'missing_source',
      });
      missingSrc++;
      continue;
    }

    // Check if bundle file exists
    if (!existsSync(bundleFilePath)) {
      entries.push({
        bundlePath: file.bundle_path,
        originalPath: file.original_path,
        resolvedPath,
        passportName: file.passport_name,
        status: 'missing_bundle',
      });
      missingBundle++;
      continue;
    }

    // Compare contents
    const sourceContent = readFileSync(resolvedPath, 'utf-8');
    const bundleContent = readFileSync(bundleFilePath, 'utf-8');

    // For memory_bootstrapped files, the bundle has stripped data —
    // we can't meaningfully compare, so just check if source was modified since export
    if (file.memory_bootstrapped) {
      const exportedAt = new Date(manifest.exported_at).getTime();
      const sourceMtime = statSync(resolvedPath).mtimeMs;
      if (sourceMtime > exportedAt) {
        entries.push({
          bundlePath: file.bundle_path,
          originalPath: file.original_path,
          resolvedPath,
          passportName: file.passport_name,
          status: 'modified',
          diff: '(memory file modified since export — diff not shown due to bootstrapping)',
        });
        modified++;
      } else {
        entries.push({
          bundlePath: file.bundle_path,
          originalPath: file.original_path,
          resolvedPath,
          passportName: file.passport_name,
          status: 'unchanged',
        });
        unchanged++;
      }
      continue;
    }

    // For secret-stripped files, compare non-redacted portions
    // Simple approach: if source has changed since export time, mark as modified
    if (file.secrets_stripped) {
      const exportedAt = new Date(manifest.exported_at).getTime();
      const sourceMtime = statSync(resolvedPath).mtimeMs;
      if (sourceMtime > exportedAt) {
        entries.push({
          bundlePath: file.bundle_path,
          originalPath: file.original_path,
          resolvedPath,
          passportName: file.passport_name,
          status: 'modified',
          diff: generateSimpleDiff(bundleContent, sourceContent),
        });
        modified++;
      } else {
        entries.push({
          bundlePath: file.bundle_path,
          originalPath: file.original_path,
          resolvedPath,
          passportName: file.passport_name,
          status: 'unchanged',
        });
        unchanged++;
      }
      continue;
    }

    // Normal comparison
    if (sourceContent !== bundleContent) {
      entries.push({
        bundlePath: file.bundle_path,
        originalPath: file.original_path,
        resolvedPath,
        passportName: file.passport_name,
        status: 'modified',
        diff: generateSimpleDiff(bundleContent, sourceContent),
      });
      modified++;
    } else {
      entries.push({
        bundlePath: file.bundle_path,
        originalPath: file.original_path,
        resolvedPath,
        passportName: file.passport_name,
        status: 'unchanged',
      });
      unchanged++;
    }
  }

  return {
    constellation: manifest.constellation.name,
    exportedAt: manifest.exported_at,
    exportedFrom: manifest.exported_from,
    entries,
    unchanged,
    modified,
    missingSrc,
    missingBundle,
  };
}

function generateSimpleDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: string[] = [];

  const maxLines = Math.max(oldLines.length, newLines.length);
  let diffCount = 0;
  const MAX_DIFF_LINES = 20;

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
