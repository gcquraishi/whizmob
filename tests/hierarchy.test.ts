/**
 * tests/hierarchy.test.ts
 *
 * Tests mob hierarchy: add-child, remove-child, cycle detection,
 * rollup of all components, and getMob with children.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SCHEMA, MIGRATIONS, TABLE_MIGRATIONS } from '../src/schema.js';

// ── Temp DB helpers ──────────────────────────────────────────────────────────

const TEST_DB_DIR = join(tmpdir(), `whizmob-hierarchy-test-${process.pid}`);
const TEST_DB_PATH = join(TEST_DB_DIR, 'test.db');

function initTestDb(): void {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  const db = new Database(TEST_DB_PATH);
  db.exec(SCHEMA);
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try { db.exec(trimmed); } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('duplicate column')) throw err;
    }
  }
  db.exec(TABLE_MIGRATIONS);
  db.close();
}

function resetTestDb(): void {
  if (existsSync(TEST_DB_PATH)) {
    const db = new Database(TEST_DB_PATH);
    db.exec('DELETE FROM mob_children; DELETE FROM mob_components; DELETE FROM mobs; DELETE FROM passports;');
    db.close();
  }
}

function cleanupTestDb(): void {
  rmSync(TEST_DB_DIR, { recursive: true, force: true });
}

// Set env before imports
process.env.WHIZMOB_DB_PATH = TEST_DB_PATH;

import {
  defineMob,
  addComponents,
  getMob,
  addChild,
  removeChild,
  getChildren,
  getAllComponents,
} from '../src/mob.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mob hierarchy', () => {
  before(initTestDb);
  after(() => {
    delete process.env.WHIZMOB_DB_PATH;
    cleanupTestDb();
  });
  beforeEach(resetTestDb);

  test('addChild nests a child mob under a parent', () => {
    defineMob('Parent', 'Top-level mob', undefined);
    defineMob('Child', 'Sub-mob', undefined);
    addChild('parent', 'child');

    const children = getChildren('parent');
    assert.equal(children.length, 1);
    assert.equal(children[0].id, 'child');
    assert.equal(children[0].name, 'Child');
  });

  test('addChild auto-increments display_order', () => {
    defineMob('Parent', '', undefined);
    defineMob('Alpha', '', undefined);
    defineMob('Beta', '', undefined);
    defineMob('Gamma', '', undefined);

    addChild('parent', 'alpha');
    addChild('parent', 'beta');
    addChild('parent', 'gamma');

    const children = getChildren('parent');
    assert.equal(children.length, 3);
    assert.equal(children[0].display_order, 0);
    assert.equal(children[1].display_order, 1);
    assert.equal(children[2].display_order, 2);
  });

  test('addChild throws on nonexistent parent', () => {
    defineMob('Child', '', undefined);
    assert.throws(() => addChild('ghost', 'child'), /not found/i);
  });

  test('addChild throws on nonexistent child', () => {
    defineMob('Parent', '', undefined);
    assert.throws(() => addChild('parent', 'ghost'), /not found/i);
  });

  test('addChild prevents self-referencing', () => {
    defineMob('Selfie', '', undefined);
    assert.throws(() => addChild('selfie', 'selfie'), /own child/i);
  });

  test('addChild prevents cycles', () => {
    defineMob('A', '', undefined);
    defineMob('B', '', undefined);
    defineMob('C', '', undefined);

    addChild('a', 'b');
    addChild('b', 'c');

    // C -> A would create a cycle: A -> B -> C -> A
    assert.throws(() => addChild('c', 'a'), /cycle/i);
  });

  test('removeChild removes the relationship', () => {
    defineMob('Parent', '', undefined);
    defineMob('Child', '', undefined);
    addChild('parent', 'child');

    const removed = removeChild('parent', 'child');
    assert.equal(removed, true);

    const children = getChildren('parent');
    assert.equal(children.length, 0);
  });

  test('removeChild returns false for nonexistent relationship', () => {
    defineMob('Parent', '', undefined);
    defineMob('Child', '', undefined);
    const removed = removeChild('parent', 'child');
    assert.equal(removed, false);
  });

  test('getMob includes children list', () => {
    defineMob('Parent', 'Has children', undefined);
    defineMob('Sub A', '', undefined);
    defineMob('Sub B', '', undefined);

    addChild('parent', 'sub-a');
    addChild('parent', 'sub-b');

    const detail = getMob('parent');
    assert.ok(detail);
    assert.equal(detail.children.length, 2);
    assert.equal(detail.children[0].id, 'sub-a');
    assert.equal(detail.children[1].id, 'sub-b');
  });

  test('getMob rolls up all_components across children', () => {
    defineMob('Parent', '', undefined);
    defineMob('Child A', '', undefined);
    defineMob('Child B', '', undefined);

    addComponents('parent', [
      { component_type: 'hook', file_path: '/tmp/shared.sh', role: null },
    ]);
    addComponents('child-a', [
      { component_type: 'hook', file_path: '/tmp/a.sh', role: null },
    ]);
    addComponents('child-b', [
      { component_type: 'hook', file_path: '/tmp/b.sh', role: null },
    ]);

    addChild('parent', 'child-a');
    addChild('parent', 'child-b');

    const detail = getMob('parent');
    assert.ok(detail);
    assert.ok(detail.all_components);
    // Parent has 1, child-a has 1, child-b has 1 = 3 total
    assert.equal(detail.all_components.length, 3);
  });

  test('getAllComponents deduplicates shared components', () => {
    defineMob('Parent', '', undefined);
    defineMob('Child A', '', undefined);
    defineMob('Child B', '', undefined);

    // Same file_path in both children
    addComponents('child-a', [
      { component_type: 'hook', file_path: '/tmp/shared.sh', role: null },
      { component_type: 'hook', file_path: '/tmp/only-a.sh', role: null },
    ]);
    addComponents('child-b', [
      { component_type: 'hook', file_path: '/tmp/shared.sh', role: null },
      { component_type: 'hook', file_path: '/tmp/only-b.sh', role: null },
    ]);

    addChild('parent', 'child-a');
    addChild('parent', 'child-b');

    const all = getAllComponents('parent');
    const paths = all.map(c => c.file_path).sort();
    // DISTINCT should deduplicate /tmp/shared.sh
    assert.equal(paths.length, 3);
    assert.deepEqual(paths, ['/tmp/only-a.sh', '/tmp/only-b.sh', '/tmp/shared.sh']);
  });

  test('flat mobs continue to work unchanged', () => {
    defineMob('Flat Mob', 'No children', undefined);
    addComponents('flat-mob', [
      { component_type: 'hook', file_path: '/tmp/flat.sh', role: null },
    ]);

    const detail = getMob('flat-mob');
    assert.ok(detail);
    assert.equal(detail.children.length, 0);
    assert.equal(detail.all_components, undefined);
    assert.equal(detail.components.length, 1);
  });

  test('component can belong to multiple mobs', () => {
    defineMob('Mob X', '', undefined);
    defineMob('Mob Y', '', undefined);

    addComponents('mob-x', [
      { component_type: 'hook', file_path: '/tmp/shared.sh', role: null },
    ]);
    addComponents('mob-y', [
      { component_type: 'hook', file_path: '/tmp/shared.sh', role: null },
    ]);

    const x = getMob('mob-x');
    const y = getMob('mob-y');
    assert.ok(x);
    assert.ok(y);
    assert.equal(x.components.length, 1);
    assert.equal(y.components.length, 1);
    assert.equal(x.components[0].file_path, '/tmp/shared.sh');
    assert.equal(y.components[0].file_path, '/tmp/shared.sh');
  });
});
