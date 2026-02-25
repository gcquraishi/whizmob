/**
 * tests/constellation.test.ts
 *
 * Tests constellation CRUD operations (define, addComponents, get, list,
 * delete) against an isolated temp database via the WHIZMOB_DB_PATH env var.
 *
 * Each test gets a fresh database by writing to a unique temp file path and
 * setting process.env.WHIZMOB_DB_PATH before importing constellation functions.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SCHEMA, MIGRATIONS } from '../src/schema.js';

// ── Temp DB helpers ──────────────────────────────────────────────────────────

const TEST_DB_DIR = join(tmpdir(), `whizmob-constellation-test-${process.pid}`);
const TEST_DB_PATH = join(TEST_DB_DIR, 'test.db');

function initTestDb(): void {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  const db = new Database(TEST_DB_PATH);
  db.exec(SCHEMA);
  // Run migrations (no-op on fresh DB but validates the pipeline)
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      db.exec(trimmed);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('duplicate column')) throw err;
    }
  }
  db.close();
}

function resetTestDb(): void {
  // Wipe and recreate so each test starts clean.
  if (existsSync(TEST_DB_PATH)) {
    const db = new Database(TEST_DB_PATH);
    db.exec('DELETE FROM constellation_components; DELETE FROM constellations; DELETE FROM passports;');
    db.close();
  }
}

function cleanupTestDb(): void {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
}

// ── Dynamic import helper ────────────────────────────────────────────────────
// We must set WHIZMOB_DB_PATH *before* the module's top-level constants are
// resolved. Because Node ESM caches modules, we set the env var once at
// process start (before any imports from the module), then import lazily.

process.env.WHIZMOB_DB_PATH = TEST_DB_PATH;

// Now we can safely import — the module will capture our env var value.
import {
  defineConstellation,
  addComponents,
  getConstellations,
  getConstellation,
  deleteConstellation,
  slugify,
} from '../src/constellation.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('constellation CRUD', () => {
  before(initTestDb);
  after(() => {
    delete process.env.WHIZMOB_DB_PATH;
    cleanupTestDb();
  });
  beforeEach(resetTestDb);

  test('slugify converts names to kebab-case ids', () => {
    assert.equal(slugify('CEO Operating System'), 'ceo-operating-system');
    assert.equal(slugify('My Agent'), 'my-agent');
    assert.equal(slugify('  leading spaces  '), 'leading-spaces');
    assert.equal(slugify('---dashes---'), 'dashes');
  });

  test('defineConstellation creates a constellation and returns its id', () => {
    const id = defineConstellation('Test Suite', 'A constellation for testing', 'tester');
    assert.equal(id, 'test-suite');

    const list = getConstellations();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'test-suite');
    assert.equal(list[0].name, 'Test Suite');
    assert.equal(list[0].author, 'tester');
    assert.equal(list[0].component_count, 0);
  });

  test('defineConstellation throws on empty/symbol-only name', () => {
    assert.throws(
      () => defineConstellation('---', '', undefined),
      /alphanumeric/,
    );
  });

  test('addComponents returns count of inserted rows', () => {
    defineConstellation('Alpha', 'First constellation', undefined);

    const added = addComponents('alpha', [
      { component_type: 'hook', file_path: '/tmp/hook.sh', role: 'start' },
      { component_type: 'claude_md', file_path: '/tmp/CLAUDE.md', role: null },
    ]);

    assert.equal(added, 2);
  });

  test('addComponents deduplicates when all four UNIQUE constraint columns are non-NULL', () => {
    // The UNIQUE constraint is (constellation_id, passport_id, component_type, file_path).
    // SQLite treats NULL as distinct from every other value (including other NULLs) in
    // UNIQUE indexes, so INSERT OR IGNORE only fires when all four columns are non-NULL.
    // When passport_id or file_path is NULL, duplicates can accumulate — see Known Issues.
    //
    // This test covers the fully-specified case (all four columns non-NULL).
    defineConstellation('Beta', 'Second constellation', undefined);

    // Insert a passport so we can use non-NULL passport_id
    const db = new Database(TEST_DB_PATH);
    db.prepare(
      `INSERT INTO passports (id, name, type, platform, scope, purpose, status, source_file, metadata_json)
       VALUES ('passport-beta', 'Beta Agent', 'subagent', 'claude-code', 'user', 'test', 'active', '/tmp/beta.md', '{}')`
    ).run();
    db.close();

    // All four UNIQUE columns are non-NULL here: constellation_id, passport_id,
    // component_type, AND file_path.
    addComponents('beta', [
      { passport_id: 'passport-beta', component_type: 'passport', file_path: '/tmp/beta.md', role: null },
    ]);

    const addedAgain = addComponents('beta', [
      { passport_id: 'passport-beta', component_type: 'passport', file_path: '/tmp/beta.md', role: null },
    ]);

    assert.equal(addedAgain, 0, 'Duplicate component (all columns non-NULL) should not be inserted again');

    const detail = getConstellation('beta');
    assert.ok(detail);
    assert.equal(detail.components.length, 1);
  });

  test('addComponents throws when constellation does not exist', () => {
    assert.throws(
      () => addComponents('nonexistent', [{ component_type: 'hook', file_path: '/x', role: null }]),
      /not found/i,
    );
  });

  test('getConstellation returns null for unknown id', () => {
    const result = getConstellation('does-not-exist');
    assert.equal(result, null);
  });

  test('getConstellation returns components grouped correctly', () => {
    defineConstellation('Gamma', 'Third constellation', undefined);
    addComponents('gamma', [
      { component_type: 'hook', file_path: '/tmp/start.sh', role: 'start' },
      { component_type: 'memory_schema', file_path: '/tmp/memory.json', role: null },
    ]);

    const detail = getConstellation('gamma');
    assert.ok(detail);
    assert.equal(detail.id, 'gamma');
    assert.equal(detail.components.length, 2);

    const types = detail.components.map(c => c.component_type).sort();
    assert.deepEqual(types, ['hook', 'memory_schema']);
  });

  test('getConstellations returns multiple constellations in alphabetical order', () => {
    defineConstellation('Zeta', '', undefined);
    defineConstellation('Alpha', '', undefined);
    defineConstellation('Mu', '', undefined);

    const list = getConstellations();
    assert.equal(list.length, 3);
    assert.equal(list[0].name, 'Alpha');
    assert.equal(list[1].name, 'Mu');
    assert.equal(list[2].name, 'Zeta');
  });

  test('deleteConstellation removes constellation and returns true', () => {
    defineConstellation('Temporary', 'Will be deleted', undefined);

    const deleted = deleteConstellation('temporary');
    assert.equal(deleted, true);
    assert.equal(getConstellations().length, 0);
  });

  test('deleteConstellation returns false for unknown id', () => {
    const result = deleteConstellation('ghost');
    assert.equal(result, false);
  });

  test('deleting a constellation cascades to its components', () => {
    defineConstellation('Cascade Test', '', undefined);
    addComponents('cascade-test', [
      { component_type: 'hook', file_path: '/tmp/hook.sh', role: null },
    ]);

    deleteConstellation('cascade-test');

    // Open the DB directly to verify components were deleted via CASCADE
    const db = new Database(TEST_DB_PATH, { readonly: true });
    const count = (
      db.prepare(`SELECT COUNT(*) as cnt FROM constellation_components WHERE constellation_id = 'cascade-test'`).get() as { cnt: number }
    ).cnt;
    db.close();

    assert.equal(count, 0, 'Components should be deleted via CASCADE when constellation is removed');
  });
});
