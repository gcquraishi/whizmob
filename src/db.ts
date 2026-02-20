import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import type { RoninInventory, AgentType } from './types.js';

const DB_DIR = join(homedir(), '.ronin');
const DB_PATH = join(DB_DIR, 'ronin.db');

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
`;

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

  const db = new Database(DB_PATH);

  db.exec(SCHEMA);

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
    INSERT INTO passports (id, name, type, platform, scope, purpose, model_hint, invocation, status, source_file, metadata_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
      updated_at = datetime('now')
  `);

  const insertMany = db.transaction(() => {
    for (const p of inventory.passports) {
      upsert.run(
        p.id, p.name, p.type, p.platform, p.scope, p.purpose,
        p.model_hint || null, p.invocation || null, p.status,
        p.source_file, JSON.stringify(p.metadata || {}),
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
  const db = new Database(DB_PATH);
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
  if (!existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true });

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
}

export function resolveSkill(nameOrId: string): PassportRow | null {
  if (!existsSync(DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Try exact ID match first
    const byId = db.prepare(
      `SELECT id, name, type, platform, purpose, source_file FROM passports
       WHERE id = ? AND type IN ('skill', 'subagent')`
    ).get(nameOrId) as PassportRow | undefined;
    if (byId) return byId;

    // Case-insensitive name match
    const byName = db.prepare(
      `SELECT id, name, type, platform, purpose, source_file FROM passports
       WHERE LOWER(name) = LOWER(?) AND type IN ('skill', 'subagent')`
    ).get(nameOrId) as PassportRow | undefined;
    if (byName) return byName;

    // Partial name match
    const byPartial = db.prepare(
      `SELECT id, name, type, platform, purpose, source_file FROM passports
       WHERE LOWER(name) LIKE LOWER(?) AND type IN ('skill', 'subagent')
       ORDER BY LENGTH(name) ASC LIMIT 1`
    ).get(`%${nameOrId}%`) as PassportRow | undefined;
    return byPartial || null;
  } finally {
    db.close();
  }
}

export function listTranslatableSkills(): PassportRow[] {
  if (!existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true });

  try {
    return db.prepare(
      `SELECT id, name, type, platform, purpose, source_file FROM passports
       WHERE type IN ('skill', 'subagent')
       ORDER BY type, name`
    ).all() as PassportRow[];
  } finally {
    db.close();
  }
}

export function getStats(): RoninStats | null {
  if (!existsSync(DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });

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

    return {
      total,
      byType,
      byPlatform,
      platformCount,
      lastScan: lastScanRow || null,
    };
  } finally {
    db.close();
  }
}
