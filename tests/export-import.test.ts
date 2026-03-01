/**
 * tests/export-import.test.ts
 *
 * Tests the export + import pipeline end-to-end using a temp database and
 * a temp output directory. No real ~/.whizmob/whizmob.db is touched.
 *
 * Flow:
 *   1. Create a temp SQLite DB with SCHEMA
 *   2. Insert a mob + a passport as a non-passport file_path component
 *      (avoids needing a real file on disk for the passport source)
 *   3. Export with dryRun=true → verify manifest structure
 *   4. Export to a real temp bundle dir → verify manifest.json written
 *   5. planImport from that bundle → verify actions produced
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  mkdirSync, rmSync, writeFileSync, existsSync, readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SCHEMA, MIGRATIONS } from '../src/schema.js';

// ── Set env var BEFORE any module-level import from export.ts / mob.ts ──

const TEST_DIR = join(tmpdir(), `whizmob-export-test-${process.pid}`);
const TEST_DB_PATH = join(TEST_DIR, 'test.db');
const BUNDLE_DIR = join(TEST_DIR, 'bundle');
const HOOK_FILE = join(TEST_DIR, 'hook.sh');
const TEMPLATIZED_SKILL = join(TEST_DIR, 'templatized-skill.md');

process.env.WHIZMOB_DB_PATH = TEST_DB_PATH;
process.env.WHIZMOB_PROFILES_DIR = join(TEST_DIR, 'import-profiles');

import { exportMob } from '../src/export.js';
import { planImport, executeImport, loadImportProfile, loadFullProfile, saveImportProfile } from '../src/import.js';

// ── Setup ────────────────────────────────────────────────────────────────────

function setup(): void {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(BUNDLE_DIR, { recursive: true });

  // Create a real file that will be included in the export
  writeFileSync(HOOK_FILE, '#!/bin/bash\necho "panel start"\n', 'utf-8');

  // Create a templatized skill file with content parameters
  writeFileSync(TEMPLATIZED_SKILL, [
    '# /roadmap — Roadmap Planning',
    '',
    'You are facilitating a roadmap session for {{ORG_NAME}}.',
    '{{OWNER_NAME}} is the PM — you provide analysis and they make the calls.',
    '',
    '## Projects',
    'Scan {{WORKSPACE_ROOT}}/*/CLAUDE.md for project state.',
  ].join('\n'), 'utf-8');

  // Bootstrap the test DB
  const db = new Database(TEST_DB_PATH);
  db.exec(SCHEMA);
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      db.exec(trimmed);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('duplicate column')) throw err;
    }
  }

  // Insert a mob
  db.prepare(
    `INSERT INTO mobs (id, name, description, author) VALUES ('export-test', 'Export Test', 'Testing the export pipeline', 'test-author')`
  ).run();

  // Insert a non-passport component with a real file_path (the hook file we wrote above)
  db.prepare(
    `INSERT INTO mob_components (mob_id, component_type, file_path, role)
     VALUES ('export-test', 'hook', ?, 'session-start')`
  ).run(HOOK_FILE);

  // Insert a second mob with templatized content
  db.prepare(
    `INSERT INTO mobs (id, name, description, author) VALUES ('param-test', 'Param Test', 'Testing content parameters', 'test-author')`
  ).run();
  db.prepare(
    `INSERT INTO mob_components (mob_id, component_type, file_path, role)
     VALUES ('param-test', 'claude_md', ?, 'skill')`
  ).run(TEMPLATIZED_SKILL);

  db.close();
}

function teardown(): void {
  delete process.env.WHIZMOB_DB_PATH;
  delete process.env.WHIZMOB_PROFILES_DIR;
  rmSync(TEST_DIR, { recursive: true, force: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('export / import pipeline', () => {
  before(setup);
  after(teardown);

  test('exportMob (dryRun) returns a manifest with correct structure', () => {
    const result = exportMob('Export Test', { dryRun: true });

    assert.equal(result.manifest.version, '1.0');
    assert.equal(result.manifest.mob.id, 'export-test');
    assert.equal(result.manifest.mob.name, 'Export Test');
    assert.equal(result.manifest.mob.author, 'test-author');

    // The hook file we added should appear in files[]
    assert.equal(result.fileCount, 1, 'Expected exactly one file in the export');
    const entry = result.manifest.files[0];
    assert.equal(entry.component_type, 'hook');
    assert.equal(entry.role, 'session-start');
    assert.equal(entry.secrets_stripped, false);
    assert.equal(entry.memory_bootstrapped, false);
  });

  test('exportMob (dryRun) does not write files to disk', () => {
    const result = exportMob('Export Test', {
      dryRun: true,
      outputDir: BUNDLE_DIR,
    });

    // In dry-run mode no manifest.json should be written
    const manifestPath = join(result.bundleDir, 'manifest.json');
    assert.equal(
      existsSync(manifestPath),
      false,
      'manifest.json should NOT be written during dry-run',
    );
  });

  test('exportMob writes manifest.json when not dry-run', () => {
    const realBundleDir = join(TEST_DIR, 'real-bundle');

    exportMob('Export Test', { outputDir: realBundleDir });

    const manifestPath = join(realBundleDir, 'manifest.json');
    assert.ok(existsSync(manifestPath), 'manifest.json should exist after a real export');

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.version, '1.0');
    assert.equal(manifest.mob.id, 'export-test');
    assert.ok(Array.isArray(manifest.files));
    assert.ok(Array.isArray(manifest.dependencies));
    assert.ok(typeof manifest.exported_at === 'string');
    assert.ok(typeof manifest.exported_from === 'string');
  });

  test('exportMob writes the actual hook file into the bundle', () => {
    const realBundleDir = join(TEST_DIR, 'real-bundle-2');

    const result = exportMob('Export Test', { outputDir: realBundleDir });

    assert.equal(result.fileCount, 1);
    const entry = result.manifest.files[0];
    const bundledFilePath = join(realBundleDir, entry.bundle_path);
    assert.ok(existsSync(bundledFilePath), `Bundled file should exist at ${bundledFilePath}`);

    const content = readFileSync(bundledFilePath, 'utf-8');
    assert.ok(content.includes('echo "panel start"'), 'Bundled file should contain hook content');
  });

  test('exportMob throws when mob does not exist', () => {
    assert.throws(
      () => exportMob('Nonexistent Mob', { dryRun: true }),
      /not found/i,
    );
  });

  test('planImport reads a valid bundle and produces import actions', () => {
    // First create a real bundle to plan from
    const planBundleDir = join(TEST_DIR, 'plan-bundle');
    exportMob('Export Test', { outputDir: planBundleDir });

    // planImport does not use WHIZMOB_DB_PATH — it only reads the manifest
    // and checks the local filesystem for conflicts.
    const plan = planImport(planBundleDir);

    assert.ok(plan.manifest, 'Plan should include the manifest');
    assert.equal(plan.manifest.version, '1.0');
    assert.ok(Array.isArray(plan.actions), 'Plan should have an actions array');
    assert.equal(plan.actions.length, 1, 'Expected one action for the hook file');

    const action = plan.actions[0];
    assert.equal(typeof action.targetPath, 'string', 'Action must have a resolved targetPath');
    assert.equal(typeof action.conflict, 'boolean');
    assert.equal(action.needsSecrets, false);
    assert.equal(action.isBootstrapped, false);
  });

  test('planImport throws for a directory without manifest.json', () => {
    const emptyDir = join(TEST_DIR, 'empty-bundle');
    mkdirSync(emptyDir, { recursive: true });

    assert.throws(
      () => planImport(emptyDir),
      /manifest\.json/i,
    );
  });

  // ── Content parameter tests ─────────────────────────────────────────────

  test('export detects content parameters in templatized files', () => {
    const result = exportMob('Param Test', { dryRun: true });

    assert.ok(result.contentParamsDetected > 0, 'Should detect content parameters');
    const cp = result.manifest.content_parameters;
    assert.ok('{{ORG_NAME}}' in cp, 'Should detect {{ORG_NAME}}');
    assert.ok('{{OWNER_NAME}}' in cp, 'Should detect {{OWNER_NAME}}');
    assert.ok('{{WORKSPACE_ROOT}}' in cp, 'Should detect {{WORKSPACE_ROOT}}');
    assert.equal(Object.keys(cp).length, 3, 'Should detect exactly 3 content params');
  });

  test('export does not flag path parameters as content parameters', () => {
    const result = exportMob('Param Test', { dryRun: true });
    const cp = result.manifest.content_parameters;

    // {{HOME}}, {{CLAUDE_DIR}}, {{WHIZMOB_DIR}} are path params, not content params
    assert.ok(!('{{HOME}}' in cp), '{{HOME}} should not be a content param');
    assert.ok(!('{{CLAUDE_DIR}}' in cp), '{{CLAUDE_DIR}} should not be a content param');
    assert.ok(!('{{WHIZMOB_DIR}}' in cp), '{{WHIZMOB_DIR}} should not be a content param');
  });

  test('content parameters are required by default', () => {
    const result = exportMob('Param Test', { dryRun: true });
    for (const meta of Object.values(result.manifest.content_parameters)) {
      assert.equal(meta.required, true, 'Content params should be required by default');
      assert.equal(meta.default_value, null, 'Content params should have no default');
    }
  });

  test('planImport warns about missing required content params', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');
    exportMob('Param Test', { outputDir: paramBundleDir });

    const plan = planImport(paramBundleDir);

    assert.ok(plan.contentParams.length === 3, 'Should have 3 content params in plan');
    const unresolved = plan.contentParams.filter(cp => !cp.resolved);
    assert.equal(unresolved.length, 3, 'All 3 should be unresolved without --param');
    assert.ok(
      plan.warnings.some(w => w.includes('{{ORG_NAME}}')),
      'Should warn about missing {{ORG_NAME}}',
    );
  });

  test('planImport resolves content params from --param flags', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');

    const plan = planImport(paramBundleDir, {
      '{{ORG_NAME}}': 'acme-corp',
      '{{OWNER_NAME}}': 'Alice',
      '{{WORKSPACE_ROOT}}': '~/work',
    });

    const resolved = plan.contentParams.filter(cp => cp.resolved);
    assert.equal(resolved.length, 3, 'All 3 should be resolved');
    assert.ok(
      !plan.warnings.some(w => w.includes('content parameter')),
      'Should have no content param warnings',
    );
  });

  test('executeImport substitutes content params in file content', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');
    const importTargetDir = join(TEST_DIR, 'import-target');
    mkdirSync(importTargetDir, { recursive: true });

    const plan = planImport(paramBundleDir, {
      '{{ORG_NAME}}': 'acme-corp',
      '{{OWNER_NAME}}': 'Alice',
      '{{WORKSPACE_ROOT}}': '~/work',
    });

    const result = executeImport(paramBundleDir, plan, { force: true });

    assert.ok(result.contentParamsApplied > 0, 'Should report substitutions applied');
    assert.equal(result.installed, 1, 'Should install 1 file');

    // Read the installed file and verify substitutions
    const installedContent = readFileSync(plan.actions[0].targetPath, 'utf-8');
    assert.ok(installedContent.includes('acme-corp'), 'Should contain substituted org name');
    assert.ok(installedContent.includes('Alice'), 'Should contain substituted owner name');
    assert.ok(installedContent.includes('~/work'), 'Should contain substituted workspace root');
    assert.ok(!installedContent.includes('{{ORG_NAME}}'), 'Should not contain raw {{ORG_NAME}} token');
    assert.ok(!installedContent.includes('{{OWNER_NAME}}'), 'Should not contain raw {{OWNER_NAME}} token');
  });

  // ── Import profile tests ──────────────────────────────────────────────

  test('saveImportProfile writes a JSON file and loadImportProfile reads it back', () => {
    // saveImportProfile uses ~/.whizmob/import-profiles/ by default,
    // but we can test the round-trip since it writes real files
    saveImportProfile('test-profile', {
      '{{ORG_NAME}}': 'test-org',
      '{{OWNER_NAME}}': 'test-owner',
    });

    const loaded = loadImportProfile('test-profile');
    assert.equal(loaded['{{ORG_NAME}}'], 'test-org');
    assert.equal(loaded['{{OWNER_NAME}}'], 'test-owner');
  });

  test('loadImportProfile returns empty object for nonexistent profile', () => {
    const loaded = loadImportProfile('nonexistent-mob');
    assert.deepEqual(loaded, {});
  });

  test('planImport with profile params resolves content params', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');

    // Save a profile first
    saveImportProfile('param-test', {
      '{{ORG_NAME}}': 'profile-org',
      '{{OWNER_NAME}}': 'profile-owner',
      '{{WORKSPACE_ROOT}}': '~/profile-work',
    });

    // Load profile and pass to planImport (simulating CLI behavior)
    const profileParams = loadImportProfile('param-test');
    const plan = planImport(paramBundleDir, profileParams);

    const resolved = plan.contentParams.filter(cp => cp.resolved);
    assert.equal(resolved.length, 3, 'All 3 should be resolved from profile');
    assert.ok(
      !plan.warnings.some(w => w.includes('content parameter')),
      'Should have no content param warnings',
    );
  });

  test('planImport warns about unknown --param keys', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');

    const plan = planImport(paramBundleDir, {
      '{{ORG_NAME}}': 'acme-corp',
      '{{BOGUS_PARAM}}': 'should-warn',
    });

    assert.ok(
      plan.warnings.some(w => w.includes('{{BOGUS_PARAM}}') && w.includes('Unknown parameter')),
      'Should warn about unknown parameter {{BOGUS_PARAM}}',
    );
  });

  test('planImport does not warn about valid path params like {{HOME}}', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');

    const plan = planImport(paramBundleDir, {
      '{{HOME}}': '/custom/home',
      '{{ORG_NAME}}': 'acme-corp',
    });

    assert.ok(
      !plan.warnings.some(w => w.includes('{{HOME}}') && w.includes('Unknown')),
      'Should NOT warn about {{HOME}} — it is a valid path param',
    );
  });

  test('CLI params override profile params', () => {
    const paramBundleDir = join(TEST_DIR, 'param-bundle');

    // Profile has one set of values
    saveImportProfile('param-test', {
      '{{ORG_NAME}}': 'profile-org',
      '{{OWNER_NAME}}': 'profile-owner',
      '{{WORKSPACE_ROOT}}': '~/profile-work',
    });

    // CLI overrides one value
    const profileParams = loadImportProfile('param-test');
    const mergedParams = { ...profileParams, '{{ORG_NAME}}': 'cli-override-org' };
    const plan = planImport(paramBundleDir, mergedParams);

    const orgParam = plan.contentParams.find(cp => cp.token === '{{ORG_NAME}}');
    assert.equal(orgParam?.value, 'cli-override-org', 'CLI should override profile');

    const ownerParam = plan.contentParams.find(cp => cp.token === '{{OWNER_NAME}}');
    assert.equal(ownerParam?.value, 'profile-owner', 'Profile value should be preserved');
  });

  // ── Versioning tests ──────────────────────────────────────────────────

  test('first export produces bundle_version 1 with empty changelog', () => {
    const versionBundleDir = join(TEST_DIR, 'version-bundle-1');

    const result = exportMob('Export Test', { outputDir: versionBundleDir });

    assert.equal(result.manifest.bundle_version, 1, 'First export should be version 1');
    assert.deepEqual(result.manifest.changelog, [], 'First export should have empty changelog');
  });

  test('re-export to same directory bumps version', () => {
    const versionBundleDir = join(TEST_DIR, 'version-bundle-reexport');

    // First export
    exportMob('Export Test', { outputDir: versionBundleDir });

    // Re-export to same dir (no source changes, but re-export should still bump)
    const result2 = exportMob('Export Test', { outputDir: versionBundleDir });

    assert.equal(result2.manifest.bundle_version, 2, 'Re-export should bump to version 2');
  });

  test('saveImportProfile stores bundle_version and loadFullProfile reads it', () => {
    saveImportProfile('version-test', {
      '{{ORG_NAME}}': 'test-org',
    }, 3);

    const full = loadFullProfile('version-test');
    assert.equal(full.last_imported_version, 3, 'Should store bundle version');
    assert.equal(full.params['{{ORG_NAME}}'], 'test-org', 'Should store params');
  });

  test('loadFullProfile returns null version for nonexistent profile', () => {
    const full = loadFullProfile('nonexistent-version-test');
    assert.equal(full.last_imported_version, null);
    assert.deepEqual(full.params, {});
  });

  test('loadFullProfile handles v1 format (flat params) gracefully', () => {
    // Write a v1-format profile (flat object, no params wrapper)
    const profileDir = join(TEST_DIR, 'import-profiles');
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(
      join(profileDir, 'v1-legacy.json'),
      JSON.stringify({ '{{ORG_NAME}}': 'legacy-org' }),
      'utf-8',
    );

    const full = loadFullProfile('v1-legacy');
    assert.equal(full.last_imported_version, null, 'v1 format has no version');
    assert.equal(full.params['{{ORG_NAME}}'], 'legacy-org', 'v1 params should be migrated');
  });
});
