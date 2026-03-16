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
// Last synced: 2026-03-01
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
  forked_from TEXT,
  mode TEXT
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

CREATE TABLE IF NOT EXISTS mobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mob_components (
  mob_id TEXT NOT NULL REFERENCES mobs(id) ON DELETE CASCADE,
  passport_id TEXT REFERENCES passports(id) ON DELETE SET NULL,
  component_type TEXT NOT NULL DEFAULT 'passport',
  file_path TEXT,
  role TEXT,
  UNIQUE (mob_id, passport_id, component_type, file_path)
);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES passports(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_id, target_id, edge_type, evidence)
);

CREATE TABLE IF NOT EXISTS mob_children (
  parent_mob_id TEXT NOT NULL REFERENCES mobs(id) ON DELETE CASCADE,
  child_mob_id TEXT NOT NULL REFERENCES mobs(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_mob_id, child_mob_id),
  CHECK (parent_mob_id != child_mob_id)
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
ALTER TABLE passports ADD COLUMN mode TEXT;
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
  mode: string | null;
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
    const existCols = existingRows[0].columns;
    for (const row of existingRows[0].values) {
      const col = (name: string) => row[existCols.indexOf(name)];
      existingIds.set(col('id') as string, col('name') as string);
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
      mode: (obj.mode as string | null) ?? null,
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
    mode: (col('mode') as string | null) ?? null,
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
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const col = (name: string) => row[columns.indexOf(name)];
    return {
      tag: col('tag') as string,
      count: col('count') as number,
    };
  });
}

// --- Mob queries ---

export interface MobRow {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
}

export interface MobComponentRow {
  passport_id: string | null;
  passport_name: string | null;
  passport_type: string | null;
  component_type: string;
  file_path: string | null;
  role: string | null;
  purpose: string | null;
  invocation: string | null;
  scope: string | null;
  tags: string[];
}

export interface MobDetailRow extends MobRow {
  components: MobComponentRow[];
}

export async function getMobs(): Promise<MobRow[]> {
  const database = await getDb();
  const result = database.exec(`
    SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
           COUNT(cc.mob_id) as component_count
    FROM mobs c
    LEFT JOIN mob_components cc ON c.id = cc.mob_id
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

export async function getMob(id: string): Promise<MobDetailRow | null> {
  const database = await getDb();
  const result = database.exec(`
    SELECT c.id, c.name, c.description, c.author, c.created_at, c.updated_at,
           COUNT(cc.mob_id) as component_count
    FROM mobs c
    LEFT JOIN mob_components cc ON c.id = cc.mob_id
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
           cc.component_type, cc.file_path, cc.role,
           p.purpose, p.invocation, p.scope
    FROM mob_components cc
    LEFT JOIN passports p ON cc.passport_id = p.id
    WHERE cc.mob_id = ?
    ORDER BY cc.component_type, COALESCE(p.name, cc.file_path)
  `, [id]);

  let components: MobComponentRow[] = [];
  if (compResult.length > 0) {
    const compCols = compResult[0].columns;

    // Collect passport IDs for batch tag fetch
    const passportIds: string[] = [];
    for (const r of compResult[0].values) {
      const pid = r[compCols.indexOf('passport_id')];
      if (pid) passportIds.push(pid as string);
    }

    // Batch fetch tags (same pattern as getPassports)
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

    components = compResult[0].values.map((r): MobComponentRow => {
      const c: Record<string, unknown> = {};
      compCols.forEach((col, i) => { c[col] = r[i]; });
      const passportId = (c.passport_id as string | null) ?? null;
      return {
        passport_id: passportId,
        passport_name: (c.passport_name as string | null) ?? null,
        passport_type: (c.passport_type as string | null) ?? null,
        component_type: c.component_type as string,
        file_path: (c.file_path as string | null) ?? null,
        role: (c.role as string | null) ?? null,
        purpose: (c.purpose as string | null) ?? null,
        invocation: (c.invocation as string | null) ?? null,
        scope: (c.scope as string | null) ?? null,
        tags: passportId ? (tagsByPassportId.get(passportId) ?? []) : [],
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

  // Get all mobs as mob nodes
  const mobResult = database.exec(`
    SELECT id, name FROM mobs ORDER BY name
  `);
  if (mobResult.length > 0) {
    const mobCols = mobResult[0].columns;
    for (const row of mobResult[0].values) {
      const col = (name: string) => row[mobCols.indexOf(name)];
      const id = col('id') as string;
      nodes.push({ id, type: 'mob', label: col('name') as string });
      nodeIds.add(id);
    }
  }

  // Get all components with their mob membership
  const compResult = database.exec(`
    SELECT cc.mob_id, cc.passport_id, cc.component_type, cc.file_path,
           p.name as passport_name, p.type as passport_type
    FROM mob_components cc
    LEFT JOIN passports p ON cc.passport_id = p.id
    ORDER BY cc.mob_id, cc.component_type
  `);

  if (compResult.length > 0) {
    // Track component node ID → list of mobs it belongs to (for shared detection)
    const componentMobs = new Map<string, string[]>();
    const compCols = compResult[0].columns;

    for (const row of compResult[0].values) {
      const col = (name: string) => row[compCols.indexOf(name)];
      const mobId = col('mob_id') as string;
      const passportId = col('passport_id') as string | null;
      const componentType = col('component_type') as string;
      const filePath = col('file_path') as string | null;
      const passportName = col('passport_name') as string | null;
      const passportType = col('passport_type') as string | null;

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
      mobs.push(mobId);
      componentMobs.set(compNodeId, mobs);

      // Edge: mob → component
      edges.push({ source: mobId, target: compNodeId, type: 'contains' });
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

// --- Edge queries ---

export interface EdgeRow {
  id: number;
  source_id: string;
  source_name: string;
  source_type: string;
  target_id: string;
  target_name: string;
  target_type: string;
  edge_type: string;
  evidence: string;
}

export async function getEdges(): Promise<EdgeRow[]> {
  const database = await getDb();
  try {
    const result = database.exec(`
      SELECT e.id, e.source_id, p1.name as source_name, p1.type as source_type,
             e.target_id, p2.name as target_name, p2.type as target_type,
             e.edge_type, e.evidence
      FROM edges e
      JOIN passports p1 ON e.source_id = p1.id
      JOIN passports p2 ON e.target_id = p2.id
      ORDER BY e.source_id, e.target_id
    `);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return {
        id: obj.id as number,
        source_id: obj.source_id as string,
        source_name: obj.source_name as string,
        source_type: obj.source_type as string,
        target_id: obj.target_id as string,
        target_name: obj.target_name as string,
        target_type: obj.target_type as string,
        edge_type: obj.edge_type as string,
        evidence: obj.evidence as string,
      };
    });
  } catch {
    // Table may not exist yet
    return [];
  }
}

export interface EdgeStats {
  total: number;
  byType: Record<string, number>;
  connectedPassports: number;
}

export async function getEdgeStats(): Promise<EdgeStats> {
  const database = await getDb();
  try {
    const typeResult = database.exec('SELECT edge_type, COUNT(*) as cnt FROM edges GROUP BY edge_type');
    const byType: Record<string, number> = {};
    let total = 0;
    if (typeResult.length > 0) {
      const typeCols = typeResult[0].columns;
      for (const row of typeResult[0].values) {
        const col = (name: string) => row[typeCols.indexOf(name)];
        const type = col('edge_type') as string;
        const count = col('cnt') as number;
        byType[type] = count;
        total += count;
      }
    }

    const connectedResult = database.exec(`
      SELECT COUNT(DISTINCT id) as cnt FROM (
        SELECT source_id as id FROM edges
        UNION
        SELECT target_id as id FROM edges
      )
    `);
    const connectedPassports = connectedResult.length > 0
      ? connectedResult[0].values[0][connectedResult[0].columns.indexOf('cnt')] as number
      : 0;

    return { total, byType, connectedPassports };
  } catch {
    return { total: 0, byType: {}, connectedPassports: 0 };
  }
}

// --- Discovered mobs (clustering) ---

export interface SubMobInfo {
  id: string;
  name: string;
  description: string;
  display_order: number;
  member_ids: string[];
}

export interface DiscoveredMob {
  id: string;
  name: string;
  members: Array<{
    passport_id: string;
    name: string;
    type: string;
    purpose: string;
    invocation: string | null;
    source_file: string;
    mode: string | null;
    sub_mob_ids?: string[];
  }>;
  edges: Array<{
    source_id: string;
    target_id: string;
    edge_type: string;
    evidence: string;
  }>;
  children?: SubMobInfo[];
}

export async function getDiscoveredMobs(): Promise<DiscoveredMob[]> {
  const database = await getDb();

  // Get all edges
  let edgeRows: Array<{ source_id: string; target_id: string; edge_type: string; evidence: string }> = [];
  try {
    const edgeResult = database.exec('SELECT source_id, target_id, edge_type, evidence FROM edges');
    if (edgeResult.length > 0) {
      const edgeCols = edgeResult[0].columns;
      edgeRows = edgeResult[0].values.map(row => {
        const col = (name: string) => row[edgeCols.indexOf(name)];
        return {
          source_id: col('source_id') as string,
          target_id: col('target_id') as string,
          edge_type: col('edge_type') as string,
          evidence: col('evidence') as string,
        };
      });
    }
  } catch {
    return [];
  }

  if (edgeRows.length === 0) return [];

  // Get passport types to filter out project/settings (infrastructure)
  const typeResult = database.exec('SELECT id, type FROM passports');
  const passportTypes = new Map<string, string>();
  if (typeResult.length > 0) {
    const ptCols = typeResult[0].columns;
    for (const row of typeResult[0].values) {
      const col = (name: string) => row[ptCols.indexOf(name)];
      passportTypes.set(col('id') as string, col('type') as string);
    }
  }
  const excludedTypes = new Set(['project', 'settings']);

  // Filter edges to exclude project/settings passports
  const filteredEdges = edgeRows.filter(e => {
    const sourceType = passportTypes.get(e.source_id);
    const targetType = passportTypes.get(e.target_id);
    return (!sourceType || !excludedTypes.has(sourceType)) &&
           (!targetType || !excludedTypes.has(targetType));
  });

  if (filteredEdges.length === 0) return [];

  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const e of filteredEdges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, new Set());
    if (!adj.has(e.target_id)) adj.set(e.target_id, new Set());
    adj.get(e.source_id)!.add(e.target_id);
    adj.get(e.target_id)!.add(e.source_id);
  }

  // BFS for connected components
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const component: string[] = [];
    const queue = [node];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adj.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }

  // Filter to 2+ members, fetch passport data, build mobs
  const mobs: DiscoveredMob[] = [];

  for (const memberIds of components) {
    if (memberIds.length < 2) continue;

    const memberSet = new Set(memberIds);

    // Fetch passport data for members
    const placeholders = memberIds.map(() => '?').join(', ');
    const passportResult = database.exec(
      `SELECT id, name, type, purpose, invocation, source_file, mode FROM passports WHERE id IN (${placeholders})`,
      memberIds
    );

    const members: DiscoveredMob['members'] = [];
    if (passportResult.length > 0) {
      const cols = passportResult[0].columns;
      for (const row of passportResult[0].values) {
        const obj: Record<string, unknown> = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        members.push({
          passport_id: obj.id as string,
          name: obj.name as string,
          type: obj.type as string,
          purpose: obj.purpose as string,
          invocation: (obj.invocation as string | null) ?? null,
          source_file: obj.source_file as string,
          mode: (obj.mode as string | null) ?? null,
        });
      }
    }

    // Internal edges
    const internalEdges = edgeRows.filter(
      e => memberSet.has(e.source_id) && memberSet.has(e.target_id)
    );

    // Name: most-connected node
    const degrees = new Map<string, number>();
    for (const m of memberIds) {
      let degree = 0;
      for (const neighbor of adj.get(m) || []) {
        if (memberSet.has(neighbor)) degree++;
      }
      degrees.set(m, degree);
    }
    const hub = memberIds.reduce((a, b) =>
      (degrees.get(a) || 0) >= (degrees.get(b) || 0) ? a : b
    );
    const hubMember = members.find(m => m.passport_id === hub);
    const name = hubMember ? `${hubMember.name} System` : 'Discovered Mob';

    const sortedIds = [...memberIds].sort();
    const id = `discovered-${sortedIds.slice(0, 3).join('-').substring(0, 40)}`;

    mobs.push({ id, name, members, edges: internalEdges });
  }

  // Sort by size descending
  mobs.sort((a, b) => b.members.length - a.members.length);

  // Enrich mobs with hierarchy data from mob_children table
  try {
    // Get all parent-child relationships
    const childResult = database.exec(`
      SELECT mc.parent_mob_id, mc.child_mob_id, mc.display_order,
             m.name, m.description
      FROM mob_children mc
      JOIN mobs m ON mc.child_mob_id = m.id
      ORDER BY mc.display_order, m.name
    `);

    if (childResult.length > 0) {
      const childCols = childResult[0].columns;
      const parentChildren = new Map<string, SubMobInfo[]>();

      for (const row of childResult[0].values) {
        const col = (name: string) => row[childCols.indexOf(name)];
        const parentId = col('parent_mob_id') as string;
        const childId = col('child_mob_id') as string;

        if (!parentChildren.has(parentId)) parentChildren.set(parentId, []);
        parentChildren.get(parentId)!.push({
          id: childId,
          name: col('name') as string,
          description: col('description') as string,
          display_order: col('display_order') as number,
          member_ids: [],
        });
      }

      // Get component-to-sub-mob mapping
      const compResult = database.exec(`
        SELECT mc2.mob_id as sub_mob_id, mc2.passport_id
        FROM mob_components mc2
        WHERE mc2.passport_id IS NOT NULL
          AND mc2.mob_id IN (SELECT child_mob_id FROM mob_children)
      `);

      const subMobMembers = new Map<string, Set<string>>();
      if (compResult.length > 0) {
        const compCols = compResult[0].columns;
        for (const row of compResult[0].values) {
          const col = (name: string) => row[compCols.indexOf(name)];
          const subMobId = col('sub_mob_id') as string;
          const passportId = col('passport_id') as string;
          if (!subMobMembers.has(subMobId)) subMobMembers.set(subMobId, new Set());
          subMobMembers.get(subMobId)!.add(passportId);
        }
      }

      // For each discovered mob, check if it overlaps with a defined parent mob
      for (const mob of mobs) {
        const mobMemberIds = new Set(mob.members.map(m => m.passport_id));

        // Check each defined parent mob
        for (const [parentId, children] of parentChildren) {
          // Get all passport IDs in this parent mob (direct + children)
          const allChildPassportIds = new Set<string>();
          for (const child of children) {
            const memberSet = subMobMembers.get(child.id);
            if (memberSet) {
              for (const pid of memberSet) {
                allChildPassportIds.add(pid);
                child.member_ids.push(pid);
              }
            }
          }

          // Check overlap: if >50% of the parent's passports are in this discovered mob
          let overlap = 0;
          for (const pid of allChildPassportIds) {
            if (mobMemberIds.has(pid)) overlap++;
          }

          if (allChildPassportIds.size > 0 && overlap / allChildPassportIds.size > 0.5) {
            // Enrich this mob with hierarchy
            mob.children = children.map(c => ({
              ...c,
              member_ids: c.member_ids.filter(pid => mobMemberIds.has(pid)),
            }));

            // Tag each member with its sub-mob(s)
            for (const member of mob.members) {
              const memberSubMobs: string[] = [];
              for (const child of children) {
                if (child.member_ids.includes(member.passport_id)) {
                  memberSubMobs.push(child.id);
                }
              }
              if (memberSubMobs.length > 0) {
                member.sub_mob_ids = memberSubMobs;
              }
            }

            // Use defined mob name if available
            const definedMobResult = database.exec(
              `SELECT name FROM mobs WHERE id = ?`, [parentId]
            );
            if (definedMobResult.length > 0 && definedMobResult[0].values.length > 0) {
              mob.name = definedMobResult[0].values[0][0] as string;
            }

            break; // Only one hierarchy per discovered mob
          }
        }
      }
    }
  } catch {
    // Hierarchy enrichment is best-effort — table may not exist in older DBs
  }

  return mobs;
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
  const columns = result[0].columns;
  const row = result[0].values[0];
  const col = (name: string) => row[columns.indexOf(name)];
  return {
    scanned_at: col('scanned_at') as string,
    duration_ms: col('duration_ms') as number,
    total: col('total') as number,
    added: col('added') as number,
    removed: col('removed') as number,
  };
}
