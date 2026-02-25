import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import type { RoninInventory, AgentType, LicenseType } from './types.js';
import { SCHEMA, MIGRATIONS } from './schema.js';

const DB_DIR = join(homedir(), '.whizmob');
const DEFAULT_DB_PATH = join(DB_DIR, 'whizmob.db');

function resolveDbPath(): string {
  return process.env.WHIZMOB_DB_PATH || DEFAULT_DB_PATH;
}

function runMigrations(db: Database.Database): void {
  for (const line of MIGRATIONS.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      db.exec(trimmed);
    } catch (err) {
      // "duplicate column name" is expected on repeat runs
      if (!(err instanceof Error) || !err.message.includes('duplicate column')) {
        throw err;
      }
    }
  }
}

export interface ConstellationRow {
  id: string;
  name: string;
  description: string;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConstellationComponentRow {
  constellation_id: string;
  passport_id: string | null;
  component_type: string;
  file_path: string | null;
  role: string | null;
}

export interface ScanDiff {
  added: number;
  removed: number;
  updated: number;
  total: number;
  added_names: string[];
  removed_names: string[];
}

export function importInventory(inventory: RoninInventory): ScanDiff {
  mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(resolveDbPath());

  db.exec(SCHEMA);
  runMigrations(db);

  // Get existing IDs
  const existingIds = new Map<string, string>();
  for (const row of db.prepare('SELECT id, name FROM passports').all() as { id: string; name: string }[]) {
    existingIds.set(row.id, row.name);
  }

  const newIds = new Set(inventory.passports.map(p => p.id));
  const addedNames: string[] = [];
  const removedNames: string[] = [];
  let updated = 0;

  const upsert = db.prepare(`
    INSERT INTO passports (id, name, type, platform, scope, purpose, model_hint, invocation, status, source_file, metadata_json, origin, author, license, forked_from, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      platform = excluded.platform,
      scope = excluded.scope,
      purpose = excluded.purpose,
      model_hint = excluded.model_hint,
      invocation = excluded.invocation,
      status = excluded.status,
      source_file = excluded.source_file,
      metadata_json = excluded.metadata_json,
      origin = COALESCE(excluded.origin, passports.origin),
      author = COALESCE(excluded.author, passports.author),
      license = COALESCE(excluded.license, passports.license),
      forked_from = COALESCE(excluded.forked_from, passports.forked_from),
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction(() => {
    for (const p of inventory.passports) {
      upsert.run(
        p.id, p.name, p.type, p.platform, p.scope, p.purpose,
        p.model_hint || null, p.invocation || null, p.status,
        p.source_file, JSON.stringify(p.metadata || {}),
        p.origin || null, p.author || null, p.license || null, p.forked_from || null,
      );
      if (!existingIds.has(p.id)) {
        addedNames.push(p.name);
      } else {
        updated++;
      }
    }

    // Remove passports no longer in scan
    const deleteStmt = db.prepare('DELETE FROM passports WHERE id = ?');
    for (const [id, name] of existingIds) {
      if (!newIds.has(id)) {
        removedNames.push(name);
        deleteStmt.run(id);
      }
    }

    // Record scan
    db.prepare(
      `INSERT INTO scans (scanned_at, duration_ms, total, added, removed, summary_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      inventory.scanned_at,
      inventory.scan_duration_ms,
      inventory.summary.total,
      addedNames.length,
      removedNames.length,
      JSON.stringify(inventory.summary),
    );
  });

  insertMany();
  db.close();

  return {
    added: addedNames.length,
    removed: removedNames.length,
    updated,
    total: inventory.summary.total,
    added_names: addedNames,
    removed_names: removedNames,
  };
}

export interface RoninStats {
  total: number;
  byType: Record<string, number>;
  byPlatform: Record<string, number>;
  platformCount: number;
  constellationCount: number;
  constellationComponentCount: number;
  lastScan: { scanned_at: string; duration_ms: number; total: number } | null;
}

export interface TranslationRecord {
  id: string;
  sourcePassportId: string;
  targetPlatform: string;
  targetFile: string;
  canonicalFile: string;
  rulesApplied: string[];
  manualReviewItems: string[];
  translatedAt: string;
}

export function recordTranslation(record: TranslationRecord): void {
  mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(resolveDbPath());
  db.exec(SCHEMA);

  try {
    db.prepare(`
      INSERT INTO translations (id, source_passport_id, target_platform, target_file, canonical_file, rules_applied, manual_review_items, translated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_passport_id, target_platform) DO UPDATE SET
        id = excluded.id,
        target_file = excluded.target_file,
        canonical_file = excluded.canonical_file,
        rules_applied = excluded.rules_applied,
        manual_review_items = excluded.manual_review_items,
        translated_at = excluded.translated_at
    `).run(
      record.id,
      record.sourcePassportId,
      record.targetPlatform,
      record.targetFile,
      record.canonicalFile,
      JSON.stringify(record.rulesApplied),
      JSON.stringify(record.manualReviewItems),
      record.translatedAt,
    );
  } finally {
    db.close();
  }
}

export function getTranslations(passportId?: string): TranslationRecord[] {
  if (!existsSync(resolveDbPath())) return [];
  const db = new Database(resolveDbPath(), { readonly: true });

  try {
    let sql = 'SELECT * FROM translations';
    const params: string[] = [];
    if (passportId) {
      sql += ' WHERE source_passport_id = ?';
      params.push(passportId);
    }
    sql += ' ORDER BY translated_at DESC';

    const rows = db.prepare(sql).all(...params) as {
      id: string;
      source_passport_id: string;
      target_platform: string;
      target_file: string;
      canonical_file: string;
      rules_applied: string;
      manual_review_items: string;
      translated_at: string;
    }[];

    return rows.map(r => ({
      id: r.id,
      sourcePassportId: r.source_passport_id,
      targetPlatform: r.target_platform,
      targetFile: r.target_file,
      canonicalFile: r.canonical_file,
      rulesApplied: JSON.parse(r.rules_applied),
      manualReviewItems: JSON.parse(r.manual_review_items),
      translatedAt: r.translated_at,
    }));
  } finally {
    db.close();
  }
}

export interface PassportRow {
  id: string;
  name: string;
  type: string;
  platform: string;
  purpose: string;
  source_file: string;
  origin: string | null;
  author: string | null;
  license: LicenseType | null;
  forked_from: string | null;
}

export function resolveSkill(nameOrId: string): PassportRow | null {
  if (!existsSync(resolveDbPath())) return null;
  const db = new Database(resolveDbPath(), { readonly: true });

  try {
    // Try exact ID match first
    const byId = db.prepare(
      `SELECT id, name, type, platform, purpose, source_file, origin, author, license, forked_from FROM passports
       WHERE id = ? AND type IN ('skill', 'subagent')`
    ).get(nameOrId) as PassportRow | undefined;
    if (byId) return byId;

    // Case-insensitive name match
    const byName = db.prepare(
      `SELECT id, name, type, platform, purpose, source_file, origin, author, license, forked_from FROM passports
       WHERE LOWER(name) = LOWER(?) AND type IN ('skill', 'subagent')`
    ).get(nameOrId) as PassportRow | undefined;
    if (byName) return byName;

    // Partial name match
    const byPartial = db.prepare(
      `SELECT id, name, type, platform, purpose, source_file, origin, author, license, forked_from FROM passports
       WHERE LOWER(name) LIKE LOWER(?) AND type IN ('skill', 'subagent')
       ORDER BY LENGTH(name) ASC LIMIT 1`
    ).get(`%${nameOrId}%`) as PassportRow | undefined;
    return byPartial || null;
  } finally {
    db.close();
  }
}

export function listTranslatableSkills(): PassportRow[] {
  if (!existsSync(resolveDbPath())) return [];
  const db = new Database(resolveDbPath(), { readonly: true });

  try {
    return db.prepare(
      `SELECT id, name, type, platform, purpose, source_file, origin, author, license, forked_from FROM passports
       WHERE type IN ('skill', 'subagent')
       ORDER BY type, name`
    ).all() as PassportRow[];
  } finally {
    db.close();
  }
}

export function getStats(): RoninStats | null {
  if (!existsSync(resolveDbPath())) return null;
  const db = new Database(resolveDbPath(), { readonly: true });

  try {
    const byType: Record<string, number> = {};
    for (const row of db.prepare('SELECT type, COUNT(*) as cnt FROM passports GROUP BY type').all() as { type: string; cnt: number }[]) {
      byType[row.type] = row.cnt;
    }

    const byPlatform: Record<string, number> = {};
    for (const row of db.prepare('SELECT platform, COUNT(*) as cnt FROM passports GROUP BY platform').all() as { platform: string; cnt: number }[]) {
      byPlatform[row.platform] = row.cnt;
    }

    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    const platformCount = Object.keys(byPlatform).length;

    const lastScanRow = db.prepare('SELECT scanned_at, duration_ms, total FROM scans ORDER BY id DESC LIMIT 1').get() as { scanned_at: string; duration_ms: number; total: number } | undefined;

    // Constellation counts (table may not exist yet)
    let constellationCount = 0;
    let constellationComponentCount = 0;
    try {
      const cRow = db.prepare('SELECT COUNT(*) as cnt FROM constellations').get() as { cnt: number };
      constellationCount = cRow.cnt;
      const ccRow = db.prepare('SELECT COUNT(*) as cnt FROM constellation_components').get() as { cnt: number };
      constellationComponentCount = ccRow.cnt;
    } catch {
      // Tables don't exist yet
    }

    return {
      total,
      byType,
      byPlatform,
      platformCount,
      constellationCount,
      constellationComponentCount,
      lastScan: lastScanRow || null,
    };
  } finally {
    db.close();
  }
}
