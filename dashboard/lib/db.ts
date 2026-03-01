import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const IS_VERCEL = !!process.env.VERCEL;
const DB_DIR = IS_VERCEL ? join(process.cwd(), 'data') : join(homedir(), '.whizmob');
const DB_PATH = join(DB_DIR, 'whizmob.db');

let db: Database | null = null;

// IMPORTANT: This schema must be kept in sync with src/schema.ts (SCHEMA constant).
// The dashboard cannot import from src/ directly due to the separate Next.js build
// context. When updating the schema, update both files.
//
// Last synced: 2026-02-24
const SCHEMA = `
CREATE TABLE IF NOT EXISTS passports (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'claude-code',
  scope TEXT NOT NULL,
  purpose TEXT NOT NULL,
  model_hint TEXT,
  invocation TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source_file TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  origin TEXT,
  author TEXT,
  license TEXT,
  forked_from TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  passport_id TEXT NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (passport_id, tag)
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scanned_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  total INTEGER NOT NULL,
  added INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  source_passport_id TEXT NOT NULL REFERENCES passports(id),
  target_platform TEXT NOT NULL,
  target_file TEXT NOT NULL,
  canonical_file TEXT NOT NULL,
  rules_applied TEXT NOT NULL,
  manual_review_items TEXT NOT NULL DEFAULT '[]',
  translated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_passport_id, target_platform)
);

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

// Additive migrations — safe to run multiple times.
// Kept in sync with src/schema.ts (MIGRATIONS constant).
const MIGRATIONS = `
-- Provenance fields (M3) — added to passports table
ALTER TABLE passports ADD COLUMN origin TEXT;
ALTER TABLE passports ADD COLUMN author TEXT;
ALTER TABLE passports ADD COLUMN license TEXT;
ALTER TABLE passports ADD COLUMN forked_from TEXT;
`;

function runMigrations(database: Database): void {
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      database.run(trimmed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // "duplicate column name" is expected on repeat runs (provenance columns).
      if (!msg.includes('duplicate column name')) throw err;
    }
  }
}

function saveDb() {
  if (!db || IS_VERCEL) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      // In Vercel serverless, the WASM file is bundled alongside the function
      // Try multiple locations to handle both local dev and Vercel
      const candidates = [
        join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
        join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
      ];
      for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
      }
      return file; // fall back to default resolution
    },
  });

  if (!IS_VERCEL) {
    mkdirSync(DB_DIR, { recursive: true });
  }

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(SCHEMA);
  runMigrations(db);
  saveDb();
  return db;
}

export interface PassportRow {
  id: string;
  name: string;
  type: string;
  platform: string;
  scope: string;
  purpose: string;
  model_hint: string | null;
  invocation: string | null;
  status: string;
  source_file: string;
  metadata_json: string;
  first_seen_at: string;
  updated_at: string;
  tags: string[];
}

export interface ScanDiff {
  added: number;
  removed: number;
  updated: number;
  total: number;
  added_names: string[];
  removed_names: string[];
}

export interface ImportableInventory {
  scanned_at: string;
  scan_duration_ms: number;
  summary: {
    total: number;
    by_type: Record<string, number>;
  };
  passports: Array<{
    id: string;
    name: string;
    type: string;
    platform: string;
    scope: string;
    purpose: string;
    model_hint?: string | null;
    invocation?: string | null;
    status: string;
    tags: string[];
    source_file: string;
    metadata: Record<string, unknown>;
  }>;
}

export async function importInventory(inventory: ImportableInventory): Promise<ScanDiff> {
  const database = await getDb();

  // Get existing IDs
  const existingRows = database.exec('SELECT id, name FROM passports');
  const existingIds = new Map<string, string>();
  if (existingRows.length > 0) {
    for (const row of existingRows[0].values) {
      existingIds.set(row[0] as string, row[1] as string);
    }
  }

  const newIds = new Set(inventory.passports.map(p => p.id));
  const addedNames: string[] = [];
  const removedNames: string[] = [];
  let updated = 0;

  // Upsert passports
  const upsertStmt = database.prepare(`
    INSERT INTO passports (id, name, type, platform, scope, purpose, model_hint, invocation, status, source_file, metadata_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      platform = excluded.platform,
      purpose = excluded.purpose,
      model_hint = excluded.model_hint,
      invocation = excluded.invocation,
      status = excluded.status,
      source_file = excluded.source_file,
      metadata_json = excluded.metadata_json,
      updated_at = datetime('now')
  `);

  for (const p of inventory.passports) {
    upsertStmt.run([
      p.id,
      p.name,
      p.type,
      p.platform || 'claude-code',
      p.scope,
      p.purpose,
      p.model_hint || null,
      p.invocation || null,
      p.status,
      p.source_file,
      JSON.stringify(p.metadata || {}),
    ]);

    if (!existingIds.has(p.id)) {
      addedNames.push(p.name);
    } else {
      updated++;
    }
  }
  upsertStmt.free();

  // Find removed
  for (const [id, name] of existingIds) {
    if (!newIds.has(id)) {
      removedNames.push(name);
      database.run('DELETE FROM passports WHERE id = ?', [id]);
    }
  }

  // Record scan
  database.run(
    `INSERT INTO scans (scanned_at, duration_ms, total, added, removed, summary_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      inventory.scanned_at,
      inventory.scan_duration_ms,
      inventory.summary.total,
      addedNames.length,
      removedNames.length,
      JSON.stringify(inventory.summary),
    ]
  );

  saveDb();

  return {
    added: addedNames.length,
    removed: removedNames.length,
    updated,
    total: inventory.summary.total,
    added_names: addedNames,
    removed_names: removedNames,
  };
}

export interface PassportFilters {
  type?: string;
  platform?: string;
  search?: string;
  tag?: string;
}

export async function getPassports(filters?: PassportFilters): Promise<PassportRow[]> {
  const database = await getDb();
  let sql = 'SELECT * FROM passports WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters?.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }

  if (filters?.platform) {
    sql += ' AND platform = ?';
    params.push(filters.platform);
  }

  if (filters?.search) {
    sql += ' AND (name LIKE ? ESCAPE \'|\' OR purpose LIKE ? ESCAPE \'|\')';
    const escaped = filters.search.replace(/[|%_]/g, '|$&');
    const term = `%${escaped}%`;
    params.push(term, term);
  }

  if (filters?.tag) {
    sql += ' AND id IN (SELECT passport_id FROM tags WHERE tag = ?)';
    params.push(filters.tag);
  }

  sql += ' ORDER BY type, name';

  const result = database.exec(sql, params);
  if (result.length === 0) return [];

  const columns = result[0].columns;

  // Collect all passport IDs first, then fetch all tags in a single query
  const passportIds = result[0].values.map(row => {
    const idIndex = columns.indexOf('id');
    return row[idIndex] as string;
  });

  const tagsByPassportId = new Map<string, string[]>();
  if (passportIds.length > 0) {
    const placeholders = passportIds.map(() => '?').join(', ');
    const tagResult = database.exec(
      `SELECT passport_id, tag FROM tags WHERE passport_id IN (${placeholders})`,
      passportIds
    );
    if (tagResult.length > 0) {
      for (const [passportId, tag] of tagResult[0].values as [string, string][]) {
        const existing = tagsByPassportId.get(passportId);
        if (existing) {
          existing.push(tag);
        } else {
          tagsByPassportId.set(passportId, [tag]);
        }
      }
    }
  }

  const rows: PassportRow[] = result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    const id = obj.id as string;
    return {
      id,
      name: obj.name as string,
      type: obj.type as string,
      platform: obj.platform as string,
      scope: obj.scope as string,
      purpose: obj.purpose as string,
      model_hint: obj.model_hint as string | null,
      invocation: obj.invocation as string | null,
      status: obj.status as string,
      source_file: obj.source_file as string,
      metadata_json: obj.metadata_json as string,
      first_seen_at: obj.first_seen_at as string,
      updated_at: obj.updated_at as string,
      tags: tagsByPassportId.get(id) ?? [],
    };
  });

  return rows;
}

export async function getPassport(id: string): Promise<PassportRow | null> {
  const database = await getDb();

  // Fetch passport and all its tags in a single query via LEFT JOIN
  const result = database.exec(`
    SELECT p.id, p.name, p.type, p.platform, p.scope, p.purpose,
           p.model_hint, p.invocation, p.status, p.source_file,
           p.metadata_json, p.first_seen_at, p.updated_at,
           t.tag
    FROM passports p
    LEFT JOIN tags t ON t.passport_id = p.id
    WHERE p.id = ?
    ORDER BY t.tag
  `, [id]);

  if (result.length === 0 || result[0].values.length === 0) return null;

  const columns = result[0].columns;
  const tagIndex = columns.indexOf('tag');

  // All rows share the same passport columns — collect tags across rows
  const firstRow = result[0].values[0];
  const tags: string[] = [];
  for (const row of result[0].values) {
    const tag = row[tagIndex];
    if (tag !== null) tags.push(tag as string);
  }

  const col = (name: string) => firstRow[columns.indexOf(name)];

  return {
    id: col('id') as string,
    name: col('name') as string,
    type: col('type') as string,
    platform: col('platform') as string,
    scope: col('scope') as string,
    purpose: col('purpose') as string,
    model_hint: col('model_hint') as string | null,
    invocation: col('invocation') as string | null,
    status: col('status') as string,
    source_file: col('source_file') as string,
    metadata_json: col('metadata_json') as string,
    first_seen_at: col('first_seen_at') as string,
    updated_at: col('updated_at') as string,
    tags,
  };
}

export async function updateTags(id: string, tags: string[]): Promise<void> {
  const database = await getDb();
  database.run('DELETE FROM tags WHERE passport_id = ?', [id]);
  for (const tag of tags) {
    database.run(
      'INSERT INTO tags (passport_id, tag) VALUES (?, ?)',
      [id, tag.trim().toLowerCase()]
    );
  }
  saveDb();
}

export async function getAllTags(): Promise<Array<{ tag: string; count: number }>> {
  const database = await getDb();
  const result = database.exec(
    'SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC, tag'
  );
  if (result.length === 0) return [];
  return result[0].values.map(row => ({
    tag: row[0] as string,
    count: row[1] as number,
  }));
}

// --- Constellation queries ---

export interface ConstellationRow {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConstellationComponentRow {
  passport_id: string | null;
  passport_name: string | null;
  passport_type: string | null;
  component_type: string;
  file_path: string | null;
  role: string | null;
}

export interface ConstellationDetailRow extends ConstellationRow {
  components: ConstellationComponentRow[];
}

export async function getConstellations(): Promise<ConstellationRow[]> {
  const database = await getDb();
  const result = database.exec(`
    SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
           COUNT(cc.constellation_id) as component_count
    FROM constellations c
    LEFT JOIN constellation_components cc ON c.id = cc.constellation_id
    GROUP BY c.id
    ORDER BY c.name
  `);
  if (result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj.id as string,
      name: obj.name as string,
      description: obj.description as string,
      author: (obj.author as string | null) ?? null,
      component_count: obj.component_count as number,
      created_at: obj.created_at as string,
      updated_at: obj.updated_at as string,
    };
  });
}

export async function getConstellation(id: string): Promise<ConstellationDetailRow | null> {
  const database = await getDb();
  const result = database.exec(`
    SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
           COUNT(cc.constellation_id) as component_count
    FROM constellations c
    LEFT JOIN constellation_components cc ON c.id = cc.constellation_id
    WHERE c.id = ?
    GROUP BY c.id
  `, [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const columns = result[0].columns;
  const row = result[0].values[0];
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });

  // Fetch components
  const compResult = database.exec(`
    SELECT cc.passport_id, p.name as passport_name, p.type as passport_type,
           cc.component_type, cc.file_path, cc.role
    FROM constellation_components cc
    LEFT JOIN passports p ON cc.passport_id = p.id
    WHERE cc.constellation_id = ?
    ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
  `, [id]);

  let components: ConstellationComponentRow[] = [];
  if (compResult.length > 0) {
    const compCols = compResult[0].columns;
    components = compResult[0].values.map(r => {
      const c: Record<string, unknown> = {};
      compCols.forEach((col, i) => { c[col] = r[i]; });
      return {
        passport_id: (c.passport_id as string | null) ?? null,
        passport_name: (c.passport_name as string | null) ?? null,
        passport_type: (c.passport_type as string | null) ?? null,
        component_type: c.component_type as string,
        file_path: (c.file_path as string | null) ?? null,
        role: (c.role as string | null) ?? null,
      };
    });
  }

  return {
    id: obj.id as string,
    name: obj.name as string,
    description: obj.description as string,
    author: (obj.author as string | null) ?? null,
    component_count: obj.component_count as number,
    created_at: obj.created_at as string,
    updated_at: obj.updated_at as string,
    components,
  };
}

// --- Mob graph data ---

export interface MobGraphNode {
  id: string;
  type: 'mob' | 'component';
  label: string;
  component_type?: string;  // for component nodes: passport, hook, memory_schema, etc.
  passport_type?: string;   // for passport components: subagent, skill, mcp, etc.
  mob_id?: string;          // which mob this component belongs to (if component)
}

export interface MobGraphEdge {
  source: string;
  target: string;
  type: 'contains' | 'shared';
}

export interface MobGraphData {
  nodes: MobGraphNode[];
  edges: MobGraphEdge[];
}

export async function getMobGraphData(): Promise<MobGraphData> {
  const database = await getDb();
  const nodes: MobGraphNode[] = [];
  const edges: MobGraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Get all constellations as mob nodes
  const mobResult = database.exec(`
    SELECT id, name FROM constellations ORDER BY name
  `);
  if (mobResult.length > 0) {
    for (const row of mobResult[0].values) {
      const id = row[0] as string;
      nodes.push({ id, type: 'mob', label: row[1] as string });
      nodeIds.add(id);
    }
  }

  // Get all components with their constellation membership
  const compResult = database.exec(`
    SELECT cc.constellation_id, cc.passport_id, cc.component_type, cc.file_path,
           p.name as passport_name, p.type as passport_type
    FROM constellation_components cc
    LEFT JOIN passports p ON cc.passport_id = p.id
    ORDER BY cc.constellation_id, cc.component_type
  `);

  if (compResult.length > 0) {
    // Track component node ID → list of mobs it belongs to (for shared detection)
    const componentMobs = new Map<string, string[]>();

    for (const row of compResult[0].values) {
      const constellationId = row[0] as string;
      const passportId = row[1] as string | null;
      const componentType = row[2] as string;
      const filePath = row[3] as string | null;
      const passportName = row[4] as string | null;
      const passportType = row[5] as string | null;

      // Derive a stable node ID for this component
      const compNodeId = passportId || `file:${filePath || 'unknown'}`;
      const label = passportName || (filePath ? filePath.split('/').pop() || filePath : '(unknown)');

      // Add component node if not already added
      if (!nodeIds.has(compNodeId)) {
        nodes.push({
          id: compNodeId,
          type: 'component',
          label,
          component_type: componentType,
          passport_type: passportType || undefined,
        });
        nodeIds.add(compNodeId);
      }

      // Track which mobs this component belongs to
      const mobs = componentMobs.get(compNodeId) || [];
      mobs.push(constellationId);
      componentMobs.set(compNodeId, mobs);

      // Edge: mob → component
      edges.push({ source: constellationId, target: compNodeId, type: 'contains' });
    }

    // Add "shared" edges between mobs that share components
    for (const [, mobs] of componentMobs) {
      if (mobs.length > 1) {
        for (let i = 0; i < mobs.length; i++) {
          for (let j = i + 1; j < mobs.length; j++) {
            // Check if this shared edge already exists
            const exists = edges.some(
              e => e.type === 'shared' &&
                ((e.source === mobs[i] && e.target === mobs[j]) ||
                 (e.source === mobs[j] && e.target === mobs[i]))
            );
            if (!exists) {
              edges.push({ source: mobs[i], target: mobs[j], type: 'shared' });
            }
          }
        }
      }
    }
  }

  return { nodes, edges };
}

export async function getLastScan(): Promise<{
  scanned_at: string;
  duration_ms: number;
  total: number;
  added: number;
  removed: number;
} | null> {
  const database = await getDb();
  const result = database.exec(
    'SELECT scanned_at, duration_ms, total, added, removed FROM scans ORDER BY id DESC LIMIT 1'
  );
  if (result.length === 0 || result[0].values.length === 0) return null;
  const row = result[0].values[0];
  return {
    scanned_at: row[0] as string,
    duration_ms: row[1] as number,
    total: row[2] as number,
    added: row[3] as number,
    removed: row[4] as number,
  };
}
