import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planUpdate, executeUpdate, computeBundleHashes } from '../src/update.js';
import { saveImportProfile } from '../src/import.js';
import type { ExportManifest } from '../src/export.js';

const TEST_DIR = join(tmpdir(), `whizmob-update-test-${process.pid}`);
const BUNDLE_DIR = join(TEST_DIR, 'bundle');
const TARGET_DIR = join(TEST_DIR, 'installed');
const PROFILES_DIR = join(TEST_DIR, 'profiles');

function makeManifest(files: Array<{ bundle_path: string; original_path: string }>): ExportManifest {
  return {
    version: '1.0',
    bundle_version: 2,
    mob: { id: 'test-mob', name: 'Test Mob', description: '', author: null },
    exported_at: new Date().toISOString(),
    exported_from: 'test',
    files: files.map(f => ({
      ...f,
      component_type: 'passport_source' as const,
      role: null,
      passport_name: f.bundle_path.replace('files/', ''),
      secrets_stripped: false,
      memory_bootstrapped: false,
    })),
    dependencies: [],
    parameters: {},
    content_parameters: {},
    changelog: [],
  };
}

function setupBundle(files: Record<string, string>): ExportManifest {
  mkdirSync(join(BUNDLE_DIR, 'files'), { recursive: true });
  const manifestFiles = Object.entries(files).map(([name, content]) => {
    const bundlePath = `files/${name}`;
    writeFileSync(join(BUNDLE_DIR, bundlePath), content, 'utf-8');
    return {
      bundle_path: bundlePath,
      original_path: join(TARGET_DIR, name),
    };
  });
  const manifest = makeManifest(manifestFiles);
  writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

function installLocally(files: Record<string, string>): void {
  mkdirSync(TARGET_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(TARGET_DIR, name), content, 'utf-8');
  }
}

function setupProfile(manifest: ExportManifest, version: number = 1): void {
  const hashes = computeBundleHashes(BUNDLE_DIR, manifest);
  process.env.WHIZMOB_PROFILES_DIR = PROFILES_DIR;
  saveImportProfile('test-mob', {}, version, hashes);
}

describe('update engine', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    process.env.WHIZMOB_PROFILES_DIR = PROFILES_DIR;
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.WHIZMOB_PROFILES_DIR;
  });

  it('detects unchanged files', () => {
    const content = 'hello world';
    // Bundle v1 has "hello world", we install it, then "update" with same content
    const manifest = setupBundle({ 'skill.md': content });
    installLocally({ 'skill.md': content });
    setupProfile(manifest);

    const plan = planUpdate(BUNDLE_DIR);
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.autoApply, 0);
    assert.equal(plan.conflicts, 0);
  });

  it('detects upstream-only changes', () => {
    const originalContent = 'version 1';
    const updatedContent = 'version 2';

    // First set up with v1 content for the profile hash
    setupBundle({ 'skill.md': originalContent });
    const v1Manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf-8'));
    installLocally({ 'skill.md': originalContent });
    setupProfile(v1Manifest, 1);

    // Now update bundle to v2 content
    writeFileSync(join(BUNDLE_DIR, 'files', 'skill.md'), updatedContent, 'utf-8');
    const v2Manifest = { ...v1Manifest, bundle_version: 2 };
    writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(v2Manifest), 'utf-8');

    const plan = planUpdate(BUNDLE_DIR);
    assert.equal(plan.autoApply, 1);
    assert.equal(plan.localOnly, 0);
    assert.equal(plan.conflicts, 0);
  });

  it('detects local-only changes', () => {
    const bundleContent = 'original';
    const manifest = setupBundle({ 'skill.md': bundleContent });
    installLocally({ 'skill.md': 'user modified this' });
    setupProfile(manifest);

    const plan = planUpdate(BUNDLE_DIR);
    assert.equal(plan.localOnly, 1);
    assert.equal(plan.autoApply, 0);
    assert.equal(plan.conflicts, 0);
  });

  it('detects both-changed conflicts', () => {
    const originalContent = 'original';

    setupBundle({ 'skill.md': originalContent });
    const v1Manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf-8'));
    installLocally({ 'skill.md': 'user modified this' });
    setupProfile(v1Manifest, 1);

    // Update bundle to different content
    writeFileSync(join(BUNDLE_DIR, 'files', 'skill.md'), 'upstream modified this', 'utf-8');
    const v2Manifest = { ...v1Manifest, bundle_version: 2 };
    writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(v2Manifest), 'utf-8');

    const plan = planUpdate(BUNDLE_DIR);
    assert.equal(plan.conflicts, 1);
    assert.ok(plan.actions[0].diff);
  });

  it('detects new files in bundle', () => {
    const manifest = setupBundle({ 'old.md': 'existing', 'new.md': 'brand new' });
    installLocally({ 'old.md': 'existing' });

    // Only hash old.md in profile
    const partialManifest = makeManifest([{
      bundle_path: 'files/old.md',
      original_path: join(TARGET_DIR, 'old.md'),
    }]);
    setupProfile(partialManifest);

    const plan = planUpdate(BUNDLE_DIR);
    const newAction = plan.actions.find(a => a.classification === 'new-file');
    assert.ok(newAction);
    assert.equal(plan.newFiles, 1);
  });

  it('executeUpdate applies upstream-only changes', () => {
    const originalContent = 'version 1';

    setupBundle({ 'skill.md': originalContent });
    const v1Manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf-8'));
    installLocally({ 'skill.md': originalContent });
    setupProfile(v1Manifest, 1);

    // Update bundle
    writeFileSync(join(BUNDLE_DIR, 'files', 'skill.md'), 'version 2', 'utf-8');
    const v2Manifest = { ...v1Manifest, bundle_version: 2 };
    writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(v2Manifest), 'utf-8');

    const plan = planUpdate(BUNDLE_DIR);
    const result = executeUpdate(BUNDLE_DIR, plan);

    assert.equal(result.applied, 1);
    const installed = readFileSync(join(TARGET_DIR, 'skill.md'), 'utf-8');
    assert.equal(installed, 'version 2');
  });

  it('executeUpdate skips conflicts without --force', () => {
    const originalContent = 'original';

    setupBundle({ 'skill.md': originalContent });
    const v1Manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf-8'));
    installLocally({ 'skill.md': 'user edit' });
    setupProfile(v1Manifest, 1);

    writeFileSync(join(BUNDLE_DIR, 'files', 'skill.md'), 'upstream edit', 'utf-8');
    const v2Manifest = { ...v1Manifest, bundle_version: 2 };
    writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(v2Manifest), 'utf-8');

    const plan = planUpdate(BUNDLE_DIR);
    const result = executeUpdate(BUNDLE_DIR, plan);

    assert.equal(result.conflicts, 1);
    assert.equal(result.applied, 0);
    // Local edit preserved
    const installed = readFileSync(join(TARGET_DIR, 'skill.md'), 'utf-8');
    assert.equal(installed, 'user edit');
  });

  it('executeUpdate applies conflicts with --force', () => {
    const originalContent = 'original';

    setupBundle({ 'skill.md': originalContent });
    const v1Manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, 'manifest.json'), 'utf-8'));
    installLocally({ 'skill.md': 'user edit' });
    setupProfile(v1Manifest, 1);

    writeFileSync(join(BUNDLE_DIR, 'files', 'skill.md'), 'upstream edit', 'utf-8');
    const v2Manifest = { ...v1Manifest, bundle_version: 2 };
    writeFileSync(join(BUNDLE_DIR, 'manifest.json'), JSON.stringify(v2Manifest), 'utf-8');

    const plan = planUpdate(BUNDLE_DIR);
    const result = executeUpdate(BUNDLE_DIR, plan, { force: true });

    assert.equal(result.applied, 1);
    assert.equal(result.conflicts, 0);
    const installed = readFileSync(join(TARGET_DIR, 'skill.md'), 'utf-8');
    assert.equal(installed, 'upstream edit');
  });
});
