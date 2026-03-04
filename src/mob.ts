import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { ComponentType } from './types.js';
import { SCHEMA, MIGRATIONS, TABLE_MIGRATIONS } from './schema.js';

const DB_DIR = join(homedir(), '.whizmob');
const DB_PATH = join(DB_DIR, 'whizmob.db');

/** Resolve the active DB path — tests can override via WHIZMOB_DB_PATH env var. */
function resolveDbPath(): string {
  return process.env.WHIZMOB_DB_PATH || DB_PATH;
}

function runMigrations(db: Database.Database): void {
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      db.exec(trimmed);
    } catch (err) {
      // "duplicate column name" is expected on repeat runs (provenance columns)
      if (!(err instanceof Error) || !err.message.includes('duplicate column')) {
        throw err;
      }
    }
  }
}

function openDb(readonly = false): Database.Database {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    throw new Error('No database found. Run `whizmob scan` first.');
  }
  const db = new Database(dbPath, { readonly });
  if (!readonly) {
    db.exec(SCHEMA);
    runMigrations(db);
    db.exec(TABLE_MIGRATIONS);
  }
  return db;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface MobSummary {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
}

export interface MobComponent {
  passport_id: string | null;
  passport_name: string | null;
  component_type: ComponentType;
  file_path: string | null;
  role: string | null;
}

export interface MobDetail extends MobSummary {
  components: MobComponent[];
  children: MobChild[];
  all_components?: MobComponent[];
}

export function defineMob(
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
      `INSERT INTO mobs (id, name, description, author)
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

export function addComponents(mobId: string, components: ComponentInput[]): number {
  const db = openDb();
  try {
    // Verify mob exists
    const exists = db.prepare('SELECT id FROM mobs WHERE id = ?').get(mobId);
    if (!exists) {
      throw new Error(`Mob "${mobId}" not found.`);
    }

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO mob_components (mob_id, passport_id, component_type, file_path, role)
       VALUES (?, ?, ?, ?, ?)`
    );

    let added = 0;
    const insertAll = db.transaction(() => {
      for (const c of components) {
        const result = stmt.run(
          mobId,
          c.passport_id || null,
          c.component_type,
          c.file_path || null,
          c.role || null,
        );
        if (result.changes > 0) added++;
      }
      // Touch updated_at
      db.prepare(
        `UPDATE mobs SET updated_at = datetime('now') WHERE id = ?`
      ).run(mobId);
    });

    insertAll();
    return added;
  } finally {
    db.close();
  }
}

export function getMobs(): MobSummary[] {
  const db = openDb(true);
  try {
    return db.prepare(`
      SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
             COUNT(cc.mob_id) as component_count
      FROM mobs c
      LEFT JOIN mob_components cc ON c.id = cc.mob_id
      GROUP BY c.id
      ORDER BY c.name
    `).all() as MobSummary[];
  } finally {
    db.close();
  }
}

export function getMob(id: string): MobDetail | null {
  const db = openDb(true);
  try {
    const row = db.prepare(`
      SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
             COUNT(cc.mob_id) as component_count
      FROM mobs c
      LEFT JOIN mob_components cc ON c.id = cc.mob_id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id) as MobSummary | undefined;

    if (!row) return null;

    const components = db.prepare(`
      SELECT cc.passport_id, p.name as passport_name, cc.component_type, cc.file_path, cc.role
      FROM mob_components cc
      LEFT JOIN passports p ON cc.passport_id = p.id
      WHERE cc.mob_id = ?
      ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
    `).all(id) as MobComponent[];

    const children = db.prepare(`
      SELECT m.id, m.name, m.description, mc.display_order,
             COUNT(cc.mob_id) as component_count
      FROM mob_children mc
      JOIN mobs m ON mc.child_mob_id = m.id
      LEFT JOIN mob_components cc ON m.id = cc.mob_id
      WHERE mc.parent_mob_id = ?
      GROUP BY m.id
      ORDER BY mc.display_order, m.name
    `).all(id) as MobChild[];

    // If this mob has children, roll up all components (deduplicated)
    let all_components: MobComponent[] | undefined;
    if (children.length > 0) {
      const allIds = collectDescendants(db, id);
      allIds.add(id);
      const placeholders = [...allIds].map(() => '?').join(',');
      all_components = db.prepare(`
        SELECT DISTINCT cc.passport_id, p.name as passport_name, cc.component_type, cc.file_path, cc.role
        FROM mob_components cc
        LEFT JOIN passports p ON cc.passport_id = p.id
        WHERE cc.mob_id IN (${placeholders})
        ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
      `).all(...allIds) as MobComponent[];
    }

    return { ...row, components, children, all_components };
  } finally {
    db.close();
  }
}

export function deleteMob(id: string): boolean {
  const db = openDb();
  try {
    const result = db.prepare('DELETE FROM mobs WHERE id = ?').run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export interface MobChild {
  id: string;
  name: string;
  description: string;
  component_count: number;
  display_order: number;
}

export function addChild(parentId: string, childId: string, displayOrder?: number): void {
  const db = openDb();
  try {
    // Verify both mobs exist
    const parent = db.prepare('SELECT id FROM mobs WHERE id = ?').get(parentId);
    if (!parent) throw new Error(`Parent mob "${parentId}" not found.`);
    const child = db.prepare('SELECT id FROM mobs WHERE id = ?').get(childId);
    if (!child) throw new Error(`Child mob "${childId}" not found.`);

    // Prevent cycles: child must not be an ancestor of parent
    if (isAncestor(db, childId, parentId)) {
      throw new Error(`Cannot add "${childId}" as child of "${parentId}" — would create a cycle.`);
    }

    const order = displayOrder ?? getNextDisplayOrder(db, parentId);
    db.prepare(
      `INSERT OR IGNORE INTO mob_children (parent_mob_id, child_mob_id, display_order)
       VALUES (?, ?, ?)`
    ).run(parentId, childId, order);

    db.prepare(
      `UPDATE mobs SET updated_at = datetime('now') WHERE id = ?`
    ).run(parentId);
  } finally {
    db.close();
  }
}

export function removeChild(parentId: string, childId: string): boolean {
  const db = openDb();
  try {
    const result = db.prepare(
      `DELETE FROM mob_children WHERE parent_mob_id = ? AND child_mob_id = ?`
    ).run(parentId, childId);

    if (result.changes > 0) {
      db.prepare(
        `UPDATE mobs SET updated_at = datetime('now') WHERE id = ?`
      ).run(parentId);
    }
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function getChildren(parentId: string): MobChild[] {
  const db = openDb(true);
  try {
    return db.prepare(`
      SELECT m.id, m.name, m.description, mc.display_order,
             COUNT(cc.mob_id) as component_count
      FROM mob_children mc
      JOIN mobs m ON mc.child_mob_id = m.id
      LEFT JOIN mob_components cc ON m.id = cc.mob_id
      WHERE mc.parent_mob_id = ?
      GROUP BY m.id
      ORDER BY mc.display_order, m.name
    `).all(parentId) as MobChild[];
  } finally {
    db.close();
  }
}

/** Get all components across a parent mob and all its children (deduplicated). */
export function getAllComponents(mobId: string): MobComponent[] {
  const db = openDb(true);
  try {
    // Collect all mob IDs in the tree
    const allIds = collectDescendants(db, mobId);
    allIds.add(mobId);

    const placeholders = [...allIds].map(() => '?').join(',');
    return db.prepare(`
      SELECT DISTINCT cc.passport_id, p.name as passport_name, cc.component_type, cc.file_path, cc.role
      FROM mob_components cc
      LEFT JOIN passports p ON cc.passport_id = p.id
      WHERE cc.mob_id IN (${placeholders})
      ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
    `).all(...allIds) as MobComponent[];
  } finally {
    db.close();
  }
}

/** Check if `candidateAncestor` is an ancestor of `mobId`. */
function isAncestor(db: Database.Database, candidateAncestor: string, mobId: string): boolean {
  const visited = new Set<string>();
  const queue = [mobId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const parents = db.prepare(
      `SELECT parent_mob_id FROM mob_children WHERE child_mob_id = ?`
    ).all(current) as { parent_mob_id: string }[];
    for (const p of parents) {
      if (p.parent_mob_id === candidateAncestor) return true;
      queue.push(p.parent_mob_id);
    }
  }
  return false;
}

function getNextDisplayOrder(db: Database.Database, parentId: string): number {
  const row = db.prepare(
    `SELECT MAX(display_order) as max_order FROM mob_children WHERE parent_mob_id = ?`
  ).get(parentId) as { max_order: number | null };
  return (row.max_order ?? -1) + 1;
}

/** Collect all descendant mob IDs via BFS. */
function collectDescendants(db: Database.Database, mobId: string): Set<string> {
  const descendants = new Set<string>();
  const queue = [mobId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = db.prepare(
      `SELECT child_mob_id FROM mob_children WHERE parent_mob_id = ?`
    ).all(current) as { child_mob_id: string }[];
    for (const c of children) {
      if (!descendants.has(c.child_mob_id)) {
        descendants.add(c.child_mob_id);
        queue.push(c.child_mob_id);
      }
    }
  }
  return descendants;
}

export function removeComponent(
  mobId: string,
  passportIdOrPath: string,
): boolean {
  const db = openDb();
  try {
    // Try removing by passport_id first
    let result = db.prepare(
      `DELETE FROM mob_components
       WHERE mob_id = ? AND passport_id = ?`
    ).run(mobId, passportIdOrPath);

    if (result.changes === 0) {
      // Try by passport name (case-insensitive)
      const passport = db.prepare(
        `SELECT id FROM passports WHERE LOWER(name) = LOWER(?)`
      ).get(passportIdOrPath) as { id: string } | undefined;

      if (passport) {
        result = db.prepare(
          `DELETE FROM mob_components
           WHERE mob_id = ? AND passport_id = ?`
        ).run(mobId, passport.id);
      }
    }

    if (result.changes === 0) {
      // Try by file_path
      result = db.prepare(
        `DELETE FROM mob_components
         WHERE mob_id = ? AND file_path = ?`
      ).run(mobId, passportIdOrPath);
    }

    if (result.changes > 0) {
      db.prepare(
        `UPDATE mobs SET updated_at = datetime('now') WHERE id = ?`
      ).run(mobId);
    }

    return result.changes > 0;
  } finally {
    db.close();
  }
}
