import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const IS_VERCEL = !!process.env.VERCEL;
const DB_DIR = IS_VERCEL ? join(process.cwd(), 'data') : join(homedir(), '.ronin');
const DB_PATH = join(DB_DIR, 'ronin.db');

let db: Database | null = null;

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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
`;

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
    sql += ' AND (name LIKE ? OR purpose LIKE ?)';
    const term = `%${filters.search}%`;
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
  const rows: PassportRow[] = result[0].values.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });

    // Fetch tags for this passport
    const tagResult = database.exec(
      'SELECT tag FROM tags WHERE passport_id = ?',
      [obj.id as string]
    );
    const tags = tagResult.length > 0 ? tagResult[0].values.map(r => r[0] as string) : [];

    return { ...obj, tags } as unknown as PassportRow;
  });

  return rows;
}

export async function getPassport(id: string): Promise<PassportRow | null> {
  const database = await getDb();
  const result = database.exec('SELECT * FROM passports WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;

  const columns = result[0].columns;
  const row = result[0].values[0];
  const obj: Record<string, unknown> = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });

  const tagResult = database.exec(
    'SELECT tag FROM tags WHERE passport_id = ?',
    [id]
  );
  const tags = tagResult.length > 0 ? tagResult[0].values.map(r => r[0] as string) : [];

  return { ...obj, tags } as unknown as PassportRow;
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
