import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Validate that a resolved path is within the user's home directory.
 * Prevents path traversal attacks from malicious bundle manifests.
 * Tests can override the safe root via WHIZMOB_SAFE_ROOT env var.
 */
export function validateTargetPath(targetPath: string): string {
  const normalized = resolve(targetPath);
  const safeRoot = process.env.WHIZMOB_SAFE_ROOT || homedir();
  if (!normalized.startsWith(safeRoot + '/') && normalized !== safeRoot) {
    throw new Error(`Path traversal blocked: "${targetPath}" resolves to "${normalized}" which is outside the home directory.`);
  }
  return normalized;
}

/**
 * Validate that a bundle_path doesn't escape the bundle directory.
 */
export function validateBundlePath(bundleRoot: string, bundlePath: string): string {
  const full = resolve(join(bundleRoot, bundlePath));
  const normalizedRoot = resolve(bundleRoot);
  if (!full.startsWith(normalizedRoot + '/') && full !== normalizedRoot) {
    throw new Error(`Path traversal blocked: bundle_path "${bundlePath}" escapes the bundle directory.`);
  }
  return full;
}
