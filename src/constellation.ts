import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { ComponentType } from './types.js';

const DB_DIR = join(homedir(), '.ronin');
const DB_PATH = join(DB_DIR, 'ronin.db');

// Re-read SCHEMA is not needed — tables are created by `ronin scan` or importInventory.
// But we need to ensure constellation tables exist when used standalone.
const CONSTELLATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS constellations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS constellation_components (
  constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  passport_id TEXT REFERENCES passports(id) ON DELETE SET NULL,
  component_type TEXT NOT NULL DEFAULT 'passport',
  file_path TEXT,
  role TEXT,
  UNIQUE (constellation_id, passport_id, component_type, file_path)
);
`;

function openDb(readonly = false): Database.Database {
  if (!existsSync(DB_PATH)) {
    throw new Error('No Ronin database found. Run `ronin scan` first.');
  }
  const db = new Database(DB_PATH, { readonly });
  if (!readonly) {
    db.exec(CONSTELLATION_SCHEMA);
  }
  return db;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ConstellationSummary {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConstellationComponent {
  passport_id: string | null;
  passport_name: string | null;
  component_type: ComponentType;
  file_path: string | null;
  role: string | null;
}

export interface ConstellationDetail extends ConstellationSummary {
  components: ConstellationComponent[];
}

export function defineConstellation(
  name: string,
  description: string,
  author?: string,
): string {
  const id = slugify(name);
  if (!id) {
    throw new Error('Name must contain at least one alphanumeric character.');
  }
  const db = openDb();
  try {
    db.prepare(
      `INSERT INTO constellations (id, name, description, author)
       VALUES (?, ?, ?, ?)`
    ).run(id, name, description, author || null);
    return id;
  } finally {
    db.close();
  }
}

export interface ComponentInput {
  passport_id?: string | null;
  component_type: ComponentType;
  file_path?: string | null;
  role?: string | null;
}

export function addComponents(constellationId: string, components: ComponentInput[]): number {
  const db = openDb();
  try {
    // Verify constellation exists
    const exists = db.prepare('SELECT id FROM constellations WHERE id = ?').get(constellationId);
    if (!exists) {
      throw new Error(`Constellation "${constellationId}" not found.`);
    }

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO constellation_components (constellation_id, passport_id, component_type, file_path, role)
       VALUES (?, ?, ?, ?, ?)`
    );

    let added = 0;
    const insertAll = db.transaction(() => {
      for (const c of components) {
        const result = stmt.run(
          constellationId,
          c.passport_id || null,
          c.component_type,
          c.file_path || null,
          c.role || null,
        );
        if (result.changes > 0) added++;
      }
      // Touch updated_at
      db.prepare(
        `UPDATE constellations SET updated_at = datetime('now') WHERE id = ?`
      ).run(constellationId);
    });

    insertAll();
    return added;
  } finally {
    db.close();
  }
}

export function getConstellations(): ConstellationSummary[] {
  const db = openDb(true);
  try {
    return db.prepare(`
      SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
             COUNT(cc.constellation_id) as component_count
      FROM constellations c
      LEFT JOIN constellation_components cc ON c.id = cc.constellation_id
      GROUP BY c.id
      ORDER BY c.name
    `).all() as ConstellationSummary[];
  } finally {
    db.close();
  }
}

export function getConstellation(id: string): ConstellationDetail | null {
  const db = openDb(true);
  try {
    const row = db.prepare(`
      SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
             COUNT(cc.constellation_id) as component_count
      FROM constellations c
      LEFT JOIN constellation_components cc ON c.id = cc.constellation_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id) as ConstellationSummary | undefined;

    if (!row) return null;

    const components = db.prepare(`
      SELECT cc.passport_id, p.name as passport_name, cc.component_type, cc.file_path, cc.role
      FROM constellation_components cc
      LEFT JOIN passports p ON cc.passport_id = p.id
      WHERE cc.constellation_id = ?
      ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
    `).all(id) as ConstellationComponent[];

    return { ...row, components };
  } finally {
    db.close();
  }
}

export function deleteConstellation(id: string): boolean {
  const db = openDb();
  try {
    const result = db.prepare('DELETE FROM constellations WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function removeComponent(
  constellationId: string,
  passportIdOrPath: string,
): boolean {
  const db = openDb();
  try {
    // Try removing by passport_id first
    let result = db.prepare(
      `DELETE FROM constellation_components
       WHERE constellation_id = ? AND passport_id = ?`
    ).run(constellationId, passportIdOrPath);

    if (result.changes === 0) {
      // Try by passport name (case-insensitive)
      const passport = db.prepare(
        `SELECT id FROM passports WHERE LOWER(name) = LOWER(?)`
      ).get(passportIdOrPath) as { id: string } | undefined;

      if (passport) {
        result = db.prepare(
          `DELETE FROM constellation_components
           WHERE constellation_id = ? AND passport_id = ?`
        ).run(constellationId, passport.id);
      }
    }

    if (result.changes === 0) {
      // Try by file_path
      result = db.prepare(
        `DELETE FROM constellation_components
         WHERE constellation_id = ? AND file_path = ?`
      ).run(constellationId, passportIdOrPath);
    }

    if (result.changes > 0) {
      db.prepare(
        `UPDATE constellations SET updated_at = datetime('now') WHERE id = ?`
      ).run(constellationId);
    }

    return result.changes > 0;
  } finally {
    db.close();
  }
}
