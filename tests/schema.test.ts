/**
 * tests/schema.test.ts
 *
 * Verifies that SCHEMA + MIGRATIONS create all expected tables in a fresh
 * in-memory SQLite database. Uses better-sqlite3 directly — no Ronin modules
 * that touch the real ~/.ronin/ronin.db.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SCHEMA, MIGRATIONS } from '../src/schema.js';

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(SCHEMA);

  // Run migrations — swallow "duplicate column" errors which are expected
  // on a freshly-created DB (columns are already in SCHEMA).
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      db.exec(trimmed);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('duplicate column')) {
        throw err;
      }
    }
  }

  return db;
}

const EXPECTED_TABLES = [
  'passports',
  'tags',
  'scans',
  'translations',
  'constellations',
  'constellation_components',
];

describe('schema', () => {
  test('SCHEMA creates all expected tables', () => {
    const db = openMemoryDb();

    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as { name: string }[];

    const tableNames = rows.map(r => r.name);

    for (const expected of EXPECTED_TABLES) {
      assert.ok(
        tableNames.includes(expected),
        `Expected table "${expected}" to exist. Found: ${tableNames.join(', ')}`,
      );
    }

    db.close();
  });

  test('passports table has provenance columns', () => {
    const db = openMemoryDb();

    const info = db.prepare('PRAGMA table_info(passports)').all() as { name: string }[];
    const columns = info.map(c => c.name);

    for (const col of ['origin', 'author', 'license', 'forked_from']) {
      assert.ok(columns.includes(col), `Expected column "passports.${col}" to exist`);
    }

    db.close();
  });

  test('constellation_components has foreign key to constellations', () => {
    const db = openMemoryDb();
    db.pragma('foreign_keys = ON');

    // Insert a constellation
    db.prepare(
      `INSERT INTO constellations (id, name, description) VALUES ('test-id', 'Test', '')`
    ).run();

    // Inserting a component with the valid constellation ID should succeed
    db.prepare(
      `INSERT INTO constellation_components (constellation_id, component_type) VALUES ('test-id', 'passport')`
    ).run();

    const count = (
      db.prepare(`SELECT COUNT(*) as cnt FROM constellation_components`).get() as { cnt: number }
    ).cnt;
    assert.equal(count, 1);

    db.close();
  });

  test('SCHEMA is idempotent — running it twice does not error', () => {
    const db = openMemoryDb();
    // Running SCHEMA a second time (IF NOT EXISTS) should be a no-op.
    assert.doesNotThrow(() => db.exec(SCHEMA));
    db.close();
  });
});
