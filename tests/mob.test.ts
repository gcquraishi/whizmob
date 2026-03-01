/**
 * tests/mob.test.ts
 *
 * Tests mob CRUD operations (define, addComponents, get, list,
 * delete) against an isolated temp database via the WHIZMOB_DB_PATH env var.
 *
 * Each test gets a fresh database by writing to a unique temp file path and
 * setting process.env.WHIZMOB_DB_PATH before importing mob functions.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SCHEMA, MIGRATIONS } from '../src/schema.js';

// ── Temp DB helpers ──────────────────────────────────────────────────────────

const TEST_DB_DIR = join(tmpdir(), `whizmob-mob-test-${process.pid}`);
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
    db.exec('DELETE FROM mob_components; DELETE FROM mobs; DELETE FROM passports;');
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
  defineMob,
  addComponents,
  getMobs,
  getMob,
  deleteMob,
  slugify,
} from '../src/mob.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mob CRUD', () => {
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

  test('defineMob creates a mob and returns its id', () => {
    const id = defineMob('Test Suite', 'A mob for testing', 'tester');
    assert.equal(id, 'test-suite');

    const list = getMobs();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'test-suite');
    assert.equal(list[0].name, 'Test Suite');
    assert.equal(list[0].author, 'tester');
    assert.equal(list[0].component_count, 0);
  });

  test('defineMob throws on empty/symbol-only name', () => {
    assert.throws(
      () => defineMob('---', '', undefined),
      /alphanumeric/,
    );
  });

  test('addComponents returns count of inserted rows', () => {
    defineMob('Alpha', 'First mob', undefined);

    const added = addComponents('alpha', [
      { component_type: 'hook', file_path: '/tmp/hook.sh', role: 'start' },
      { component_type: 'claude_md', file_path: '/tmp/CLAUDE.md', role: null },
    ]);

    assert.equal(added, 2);
  });

  test('addComponents deduplicates when all four UNIQUE constraint columns are non-NULL', () => {
    // The UNIQUE constraint is (mob_id, passport_id, component_type, file_path).
    // SQLite treats NULL as distinct from every other value (including other NULLs) in
    // UNIQUE indexes, so INSERT OR IGNORE only fires when all four columns are non-NULL.
    // When passport_id or file_path is NULL, duplicates can accumulate — see Known Issues.
    //
    // This test covers the fully-specified case (all four columns non-NULL).
    defineMob('Beta', 'Second mob', undefined);

    // Insert a passport so we can use non-NULL passport_id
    const db = new Database(TEST_DB_PATH);
    db.prepare(
      `INSERT INTO passports (id, name, type, platform, scope, purpose, status, source_file, metadata_json)
       VALUES ('passport-beta', 'Beta Agent', 'subagent', 'claude-code', 'user', 'test', 'active', '/tmp/beta.md', '{}')`
    ).run();
    db.close();

    // All four UNIQUE columns are non-NULL here: mob_id, passport_id,
    // component_type, AND file_path.
    addComponents('beta', [
      { passport_id: 'passport-beta', component_type: 'passport', file_path: '/tmp/beta.md', role: null },
    ]);

    const addedAgain = addComponents('beta', [
      { passport_id: 'passport-beta', component_type: 'passport', file_path: '/tmp/beta.md', role: null },
    ]);

    assert.equal(addedAgain, 0, 'Duplicate component (all columns non-NULL) should not be inserted again');

    const detail = getMob('beta');
    assert.ok(detail);
    assert.equal(detail.components.length, 1);
  });

  test('addComponents throws when mob does not exist', () => {
    assert.throws(
      () => addComponents('nonexistent', [{ component_type: 'hook', file_path: '/x', role: null }]),
      /not found/i,
    );
  });

  test('getMob returns null for unknown id', () => {
    const result = getMob('does-not-exist');
    assert.equal(result, null);
  });

  test('getMob returns components grouped correctly', () => {
    defineMob('Gamma', 'Third mob', undefined);
    addComponents('gamma', [
      { component_type: 'hook', file_path: '/tmp/start.sh', role: 'start' },
      { component_type: 'memory_schema', file_path: '/tmp/memory.json', role: null },
    ]);

    const detail = getMob('gamma');
    assert.ok(detail);
    assert.equal(detail.id, 'gamma');
    assert.equal(detail.components.length, 2);

    const types = detail.components.map(c => c.component_type).sort();
    assert.deepEqual(types, ['hook', 'memory_schema']);
  });

  test('getMobs returns multiple mobs in alphabetical order', () => {
    defineMob('Zeta', '', undefined);
    defineMob('Alpha', '', undefined);
    defineMob('Mu', '', undefined);

    const list = getMobs();
    assert.equal(list.length, 3);
    assert.equal(list[0].name, 'Alpha');
    assert.equal(list[1].name, 'Mu');
    assert.equal(list[2].name, 'Zeta');
  });

  test('deleteMob removes mob and returns true', () => {
    defineMob('Temporary', 'Will be deleted', undefined);

    const deleted = deleteMob('temporary');
    assert.equal(deleted, true);
    assert.equal(getMobs().length, 0);
  });

  test('deleteMob returns false for unknown id', () => {
    const result = deleteMob('ghost');
    assert.equal(result, false);
  });

  test('deleting a mob cascades to its components', () => {
    defineMob('Cascade Test', '', undefined);
    addComponents('cascade-test', [
      { component_type: 'hook', file_path: '/tmp/hook.sh', role: null },
    ]);

    deleteMob('cascade-test');

    // Open the DB directly to verify components were deleted via CASCADE
    const db = new Database(TEST_DB_PATH, { readonly: true });
    const count = (
      db.prepare(`SELECT COUNT(*) as cnt FROM mob_components WHERE mob_id = 'cascade-test'`).get() as { cnt: number }
    ).cnt;
    db.close();

    assert.equal(count, 0, 'Components should be deleted via CASCADE when mob is removed');
  });
});
