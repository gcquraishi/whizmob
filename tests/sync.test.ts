/**
 * tests/sync.test.ts
 *
 * Tests for the sync engine that compares bundle files against their
 * source locations to detect changes.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { syncMob } from '../src/sync.js';
import type { ExportManifest } from '../src/export.js';

const TEST_DIR = join(tmpdir(), `whizmob-sync-test-${process.pid}`);
const BUNDLE_DIR = join(TEST_DIR, 'bundle');
const SOURCE_DIR = join(TEST_DIR, 'source');

function writeManifest(files: Array<{ bundle_path: string; original_path: string; secrets_stripped?: boolean; memory_bootstrapped?: boolean }>): void {
  const manifest: ExportManifest = {
    version: '1.0',
    bundle_version: 1,
    mob: { id: 'sync-test', name: 'Sync Test', description: '', author: null },
    exported_at: new Date().toISOString(),
    exported_from: 'test',
    files: files.map(f => ({
      bundle_path: f.bundle_path,
      original_path: f.original_path,
      component_type: 'hook' as const,
      role: null,
      passport_name: null,
      secrets_stripped: f.secrets_stripped ?? false,
      memory_bootstrapped: f.memory_bootstrapped ?? false,
    })),
    dependencies: [],
    parameters: {},
    content_parameters: {},
    changelog: [],
  };
  writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

describe('sync engine', () => {
  before(() => {
    mkdirSync(BUNDLE_DIR, { recursive: true });
    mkdirSync(SOURCE_DIR, { recursive: true });
  });
  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('throws for missing manifest.json', () => {
    const emptyDir = join(TEST_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    assert.throws(
      () => syncMob(emptyDir),
      /manifest\.json/i,
    );
  });

  test('detects unchanged files', () => {
    const content = 'identical content';
    const sourcePath = join(SOURCE_DIR, 'unchanged.md');
    const bundlePath = 'files/unchanged.md';

    writeFileSync(sourcePath, content, 'utf-8');
    mkdirSync(join(BUNDLE_DIR, 'files'), { recursive: true });
    writeFileSync(join(BUNDLE_DIR, bundlePath), content, 'utf-8');
    writeManifest([{ bundle_path: bundlePath, original_path: sourcePath }]);

    const result = syncMob(BUNDLE_DIR);
    assert.equal(result.unchanged, 1);
    assert.equal(result.modified, 0);
    assert.equal(result.entries[0].status, 'unchanged');
  });

  test('detects modified files', () => {
    const sourcePath = join(SOURCE_DIR, 'modified.md');
    const bundlePath = 'files/modified.md';

    writeFileSync(sourcePath, 'updated content', 'utf-8');
    mkdirSync(join(BUNDLE_DIR, 'files'), { recursive: true });
    writeFileSync(join(BUNDLE_DIR, bundlePath), 'original content', 'utf-8');
    writeManifest([{ bundle_path: bundlePath, original_path: sourcePath }]);

    const result = syncMob(BUNDLE_DIR);
    assert.equal(result.modified, 1);
    assert.equal(result.entries[0].status, 'modified');
    assert.ok(result.entries[0].diff, 'Modified entry should have a diff');
  });

  test('detects missing source files', () => {
    const sourcePath = join(SOURCE_DIR, 'does-not-exist.md');
    const bundlePath = 'files/missing-src.md';

    mkdirSync(join(BUNDLE_DIR, 'files'), { recursive: true });
    writeFileSync(join(BUNDLE_DIR, bundlePath), 'content', 'utf-8');
    writeManifest([{ bundle_path: bundlePath, original_path: sourcePath }]);

    const result = syncMob(BUNDLE_DIR);
    assert.equal(result.missingSrc, 1);
    assert.equal(result.entries[0].status, 'missing_source');
  });

  test('detects missing bundle files', () => {
    const sourcePath = join(SOURCE_DIR, 'exists.md');
    const bundlePath = 'files/missing-bundle.md';

    writeFileSync(sourcePath, 'content', 'utf-8');
    // Don't write the bundle file
    writeManifest([{ bundle_path: bundlePath, original_path: sourcePath }]);

    const result = syncMob(BUNDLE_DIR);
    assert.equal(result.missingBundle, 1);
    assert.equal(result.entries[0].status, 'missing_bundle');
  });

  test('returns mob name from manifest', () => {
    const sourcePath = join(SOURCE_DIR, 'name-test.md');
    const bundlePath = 'files/name-test.md';

    writeFileSync(sourcePath, 'content', 'utf-8');
    mkdirSync(join(BUNDLE_DIR, 'files'), { recursive: true });
    writeFileSync(join(BUNDLE_DIR, bundlePath), 'content', 'utf-8');
    writeManifest([{ bundle_path: bundlePath, original_path: sourcePath }]);

    const result = syncMob(BUNDLE_DIR);
    assert.equal(result.mob, 'Sync Test');
  });
});
