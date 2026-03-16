/**
 * tests/mode.test.ts
 *
 * Tests for the `mode` field across the data model:
 * - Schema migration (mode column exists)
 * - DB storage and retrieval with mode
 * - Mode filtering queries
 * - Stats mode distribution
 * - Mode migration idempotency
 *
 * Note: parseSkills() tests are in tests/mode-parser.test.ts (requires
 * gray-matter which has a Node 25 / tsx compatibility issue).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SCHEMA, MIGRATIONS } from '../src/schema.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function openMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mode field', () => {
  test('passports table has mode column', () => {
    const db = openMemoryDb();
    const info = db.prepare('PRAGMA table_info(passports)').all() as { name: string }[];
    const columns = info.map(c => c.name);
    assert.ok(columns.includes('mode'), 'Expected column "passports.mode" to exist');
    db.close();
  });

  test('mode column stores and retrieves values', () => {
    const db = openMemoryDb();

    db.prepare(`
      INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('test-1', 'Test Operator', 'skill', 'claude-code', 'user', 'Test', '~/test', 'operator')
    `).run();

    db.prepare(`
      INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('test-2', 'Test No Mode', 'skill', 'claude-code', 'user', 'Test', '~/test2', NULL)
    `).run();

    const row1 = db.prepare('SELECT mode FROM passports WHERE id = ?').get('test-1') as { mode: string | null };
    assert.equal(row1.mode, 'operator');

    const row2 = db.prepare('SELECT mode FROM passports WHERE id = ?').get('test-2') as { mode: string | null };
    assert.equal(row2.mode, null);

    db.close();
  });

  test('mode filtering query returns correct results', () => {
    const db = openMemoryDb();

    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('m1', 'A', 'skill', 'claude-code', 'user', 'test', '~/a', 'operator')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('m2', 'B', 'skill', 'claude-code', 'user', 'test', '~/b', 'founder')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('m3', 'C', 'skill', 'claude-code', 'user', 'test', '~/c', 'operator')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('m4', 'D', 'subagent', 'claude-code', 'user', 'test', '~/d', NULL)`).run();

    const operators = db.prepare(
      'SELECT id FROM passports WHERE mode = ?'
    ).all('operator') as { id: string }[];
    assert.equal(operators.length, 2);

    const founders = db.prepare(
      'SELECT id FROM passports WHERE mode = ?'
    ).all('founder') as { id: string }[];
    assert.equal(founders.length, 1);

    const noMode = db.prepare(
      'SELECT id FROM passports WHERE mode IS NULL'
    ).all() as { id: string }[];
    assert.equal(noMode.length, 1);

    db.close();
  });

  test('mode distribution query groups correctly', () => {
    const db = openMemoryDb();

    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('s1', 'A', 'skill', 'claude-code', 'user', 'test', '~/a', 'operator')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('s2', 'B', 'skill', 'claude-code', 'user', 'test', '~/b', 'operator')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('s3', 'C', 'skill', 'claude-code', 'user', 'test', '~/c', 'founder')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('s4', 'D', 'subagent', 'claude-code', 'user', 'test', '~/d', NULL)`).run();

    const byMode: Record<string, number> = {};
    for (const row of db.prepare(
      'SELECT mode, COUNT(*) as cnt FROM passports WHERE mode IS NOT NULL GROUP BY mode'
    ).all() as { mode: string; cnt: number }[]) {
      byMode[row.mode] = row.cnt;
    }

    assert.equal(byMode['operator'], 2);
    assert.equal(byMode['founder'], 1);
    assert.equal(byMode['engineer'], undefined);

    db.close();
  });

  test('mode migration is idempotent', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);

    // Running migration twice should not error
    for (let i = 0; i < 2; i++) {
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
    }

    // mode column should exist
    const info = db.prepare('PRAGMA table_info(passports)').all() as { name: string }[];
    assert.ok(info.map(c => c.name).includes('mode'));

    db.close();
  });

  test('mode works with combined type and mode filtering', () => {
    const db = openMemoryDb();

    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('f1', 'Skill A', 'skill', 'claude-code', 'user', 'test', '~/a', 'operator')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('f2', 'Agent B', 'subagent', 'claude-code', 'user', 'test', '~/b', 'operator')`).run();
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('f3', 'Skill C', 'skill', 'claude-code', 'user', 'test', '~/c', 'founder')`).run();

    // Filter by both type and mode
    const skillOperators = db.prepare(
      'SELECT id FROM passports WHERE type = ? AND mode = ?'
    ).all('skill', 'operator') as { id: string }[];
    assert.equal(skillOperators.length, 1);
    assert.equal(skillOperators[0].id, 'f1');

    db.close();
  });

  test('mode preserves value through COALESCE on upsert', () => {
    const db = openMemoryDb();

    // Initial insert with mode
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('u1', 'Test', 'skill', 'claude-code', 'user', 'test', '~/a', 'engineer')`).run();

    // Upsert with NULL mode should preserve existing mode via COALESCE
    db.prepare(`
      INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode, updated_at)
      VALUES ('u1', 'Test Updated', 'skill', 'claude-code', 'user', 'test updated', '~/a', NULL, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        purpose = excluded.purpose,
        mode = COALESCE(excluded.mode, passports.mode),
        updated_at = datetime('now')
    `).run();

    const row = db.prepare('SELECT name, mode FROM passports WHERE id = ?').get('u1') as { name: string; mode: string | null };
    assert.equal(row.name, 'Test Updated');
    assert.equal(row.mode, 'engineer', 'Mode should be preserved via COALESCE when upsert value is NULL');

    db.close();
  });

  test('mode can be any string value (user-defined)', () => {
    const db = openMemoryDb();

    // Custom mode values should work (no enum validation)
    db.prepare(`INSERT INTO passports (id, name, type, platform, scope, purpose, source_file, mode)
      VALUES ('c1', 'Custom', 'skill', 'claude-code', 'user', 'test', '~/a', 'my-custom-mode')`).run();

    const row = db.prepare('SELECT mode FROM passports WHERE id = ?').get('c1') as { mode: string };
    assert.equal(row.mode, 'my-custom-mode');

    db.close();
  });
});
