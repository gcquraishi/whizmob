/**
 * tests/export-import.test.ts
 *
 * Tests the export + import pipeline end-to-end using a temp database and
 * a temp output directory. No real ~/.whizmob/whizmob.db is touched.
 *
 * Flow:
 *   1. Create a temp SQLite DB with SCHEMA
 *   2. Insert a constellation + a passport as a non-passport file_path component
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

// ── Set env var BEFORE any module-level import from export.ts / constellation.ts ──

const TEST_DIR = join(tmpdir(), `whizmob-export-test-${process.pid}`);
const TEST_DB_PATH = join(TEST_DIR, 'test.db');
const BUNDLE_DIR = join(TEST_DIR, 'bundle');
const HOOK_FILE = join(TEST_DIR, 'hook.sh');

process.env.WHIZMOB_DB_PATH = TEST_DB_PATH;

import { exportConstellation } from '../src/export.js';
import { planImport } from '../src/import.js';

// ── Setup ────────────────────────────────────────────────────────────────────

function setup(): void {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(BUNDLE_DIR, { recursive: true });

  // Create a real file that will be included in the export
  writeFileSync(HOOK_FILE, '#!/bin/bash\necho "panel start"\n', 'utf-8');

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

  // Insert a constellation
  db.prepare(
    `INSERT INTO constellations (id, name, description, author) VALUES ('export-test', 'Export Test', 'Testing the export pipeline', 'test-author')`
  ).run();

  // Insert a non-passport component with a real file_path (the hook file we wrote above)
  db.prepare(
    `INSERT INTO constellation_components (constellation_id, component_type, file_path, role)
     VALUES ('export-test', 'hook', ?, 'session-start')`
  ).run(HOOK_FILE);

  db.close();
}

function teardown(): void {
  delete process.env.WHIZMOB_DB_PATH;
  rmSync(TEST_DIR, { recursive: true, force: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('export / import pipeline', () => {
  before(setup);
  after(teardown);

  test('exportConstellation (dryRun) returns a manifest with correct structure', () => {
    const result = exportConstellation('Export Test', { dryRun: true });

    assert.equal(result.manifest.version, '1.0');
    assert.equal(result.manifest.constellation.id, 'export-test');
    assert.equal(result.manifest.constellation.name, 'Export Test');
    assert.equal(result.manifest.constellation.author, 'test-author');

    // The hook file we added should appear in files[]
    assert.equal(result.fileCount, 1, 'Expected exactly one file in the export');
    const entry = result.manifest.files[0];
    assert.equal(entry.component_type, 'hook');
    assert.equal(entry.role, 'session-start');
    assert.equal(entry.secrets_stripped, false);
    assert.equal(entry.memory_bootstrapped, false);
  });

  test('exportConstellation (dryRun) does not write files to disk', () => {
    const result = exportConstellation('Export Test', {
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

  test('exportConstellation writes manifest.json when not dry-run', () => {
    const realBundleDir = join(TEST_DIR, 'real-bundle');

    exportConstellation('Export Test', { outputDir: realBundleDir });

    const manifestPath = join(realBundleDir, 'manifest.json');
    assert.ok(existsSync(manifestPath), 'manifest.json should exist after a real export');

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.version, '1.0');
    assert.equal(manifest.constellation.id, 'export-test');
    assert.ok(Array.isArray(manifest.files));
    assert.ok(Array.isArray(manifest.dependencies));
    assert.ok(typeof manifest.exported_at === 'string');
    assert.ok(typeof manifest.exported_from === 'string');
  });

  test('exportConstellation writes the actual hook file into the bundle', () => {
    const realBundleDir = join(TEST_DIR, 'real-bundle-2');

    const result = exportConstellation('Export Test', { outputDir: realBundleDir });

    assert.equal(result.fileCount, 1);
    const entry = result.manifest.files[0];
    const bundledFilePath = join(realBundleDir, entry.bundle_path);
    assert.ok(existsSync(bundledFilePath), `Bundled file should exist at ${bundledFilePath}`);

    const content = readFileSync(bundledFilePath, 'utf-8');
    assert.ok(content.includes('echo "panel start"'), 'Bundled file should contain hook content');
  });

  test('exportConstellation throws when constellation does not exist', () => {
    assert.throws(
      () => exportConstellation('Nonexistent Constellation', { dryRun: true }),
      /not found/i,
    );
  });

  test('planImport reads a valid bundle and produces import actions', () => {
    // First create a real bundle to plan from
    const planBundleDir = join(TEST_DIR, 'plan-bundle');
    exportConstellation('Export Test', { outputDir: planBundleDir });

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
});
