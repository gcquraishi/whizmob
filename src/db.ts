import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';
import type { WhizmobInventory, AgentType, LicenseType } from './types.js';
import { SCHEMA, MIGRATIONS, TABLE_MIGRATIONS } from './schema.js';
import type { InferredEdge } from './edges.js';
import { clusterMobs } from './edges.js';
import { discoverSubMobs } from './cluster.js';

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

export interface MobRow {
  id: string;
  name: string;
  description: string;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface MobComponentRow {
  mob_id: string;
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

export function importInventory(inventory: WhizmobInventory): ScanDiff {
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

export interface EdgeRow {
  id: number;
  source_id: string;
  target_id: string;
  edge_type: string;
  evidence: string;
  created_at: string;
}

export function importEdges(edges: InferredEdge[]): { added: number; total: number } {
  mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(resolveDbPath());
  db.exec(SCHEMA);
  runMigrations(db);

  try {
    // Clear previous edges (they're re-inferred on each scan)
    db.exec('DELETE FROM edges');

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO edges (source_id, target_id, edge_type, evidence)
       VALUES (?, ?, ?, ?)`
    );

    let added = 0;
    const insertAll = db.transaction(() => {
      for (const e of edges) {
        const result = stmt.run(e.source_id, e.target_id, e.edge_type, e.evidence);
        if (result.changes > 0) added++;
      }
    });

    insertAll();
    return { added, total: edges.length };
  } finally {
    db.close();
  }
}

export function getEdges(): EdgeRow[] {
  if (!existsSync(resolveDbPath())) return [];
  const db = new Database(resolveDbPath(), { readonly: true });

  try {
    return db.prepare(
      `SELECT id, source_id, target_id, edge_type, evidence, created_at
       FROM edges ORDER BY source_id, target_id`
    ).all() as EdgeRow[];
  } catch {
    // Table may not exist yet
    return [];
  } finally {
    db.close();
  }
}

export interface WhizmobStats {
  total: number;
  byType: Record<string, number>;
  byPlatform: Record<string, number>;
  platformCount: number;
  mobCount: number;
  mobComponentCount: number;
  edgeCount: number;
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

export function getStats(): WhizmobStats | null {
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

    // Mob counts (table may not exist yet)
    let mobCount = 0;
    let mobComponentCount = 0;
    let edgeCount = 0;
    try {
      const cRow = db.prepare('SELECT COUNT(*) as cnt FROM mobs').get() as { cnt: number };
      mobCount = cRow.cnt;
      const ccRow = db.prepare('SELECT COUNT(*) as cnt FROM mob_components').get() as { cnt: number };
      mobComponentCount = ccRow.cnt;
    } catch {
      // Tables don't exist yet
    }
    try {
      const eRow = db.prepare('SELECT COUNT(*) as cnt FROM edges').get() as { cnt: number };
      edgeCount = eRow.cnt;
    } catch {
      // Table may not exist yet
    }

    return {
      total,
      byType,
      byPlatform,
      platformCount,
      mobCount,
      mobComponentCount,
      edgeCount,
      lastScan: lastScanRow || null,
    };
  } finally {
    db.close();
  }
}

export interface AutoDiscoveryResult {
  parentMobs: number;
  subMobs: number;
  skippedManual: number;
}

/**
 * Auto-discover sub-mob hierarchy from edges.
 * Clusters passports into connected components (parent mobs),
 * then runs heuristics to find sub-groups within each.
 * Skips mobs that already have manual hierarchy definitions.
 */
export function autoDiscoverHierarchy(edges: InferredEdge[]): AutoDiscoveryResult {
  mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(resolveDbPath());
  db.exec(SCHEMA);
  runMigrations(db);
  try { db.exec(TABLE_MIGRATIONS); } catch { /* already exists */ }

  try {
    // Get passport info for clustering and naming
    const passportRows = db.prepare(
      'SELECT id, name, type, invocation FROM passports'
    ).all() as Array<{ id: string; name: string; type: string; invocation: string | null }>;

    const passportNames = new Map<string, string>();
    const passportTypes = new Map<string, string>();
    const passportInfo = new Map<string, { id: string; name: string; type: string; invocation: string | null }>();

    for (const row of passportRows) {
      passportNames.set(row.id, row.name);
      passportTypes.set(row.id, row.type);
      passportInfo.set(row.id, row);
    }

    // Find connected components
    const discoveredMobs = clusterMobs(edges, passportNames, passportTypes);

    // Check which mobs already have manual hierarchy (exclude auto-discovered parents)
    const existingParents = new Set<string>();
    try {
      const rows = db.prepare(`
        SELECT DISTINCT mc.parent_mob_id
        FROM mob_children mc
        JOIN mobs m ON mc.parent_mob_id = m.id
        WHERE m.author IS NULL OR m.author != 'whizmob-auto'
      `).all() as Array<{ parent_mob_id: string }>;
      for (const row of rows) existingParents.add(row.parent_mob_id);
    } catch { /* table may not exist */ }

    // Get existing mob IDs to check overlap (exclude auto-discovered mobs)
    const existingMobs = new Map<string, { id: string; memberIds: Set<string> }>();
    try {
      const mobRows = db.prepare(
        "SELECT id FROM mobs WHERE author IS NULL OR author != 'whizmob-auto'"
      ).all() as Array<{ id: string }>;
      for (const row of mobRows) {
        const compRows = db.prepare(
          'SELECT passport_id FROM mob_components WHERE mob_id = ? AND passport_id IS NOT NULL'
        ).all(row.id) as Array<{ passport_id: string }>;
        existingMobs.set(row.id, {
          id: row.id,
          memberIds: new Set(compRows.map(r => r.passport_id)),
        });
      }
    } catch { /* tables may not exist */ }

    let parentCount = 0;
    let subMobCount = 0;
    let skippedManual = 0;

    // Clean up previous auto-discovered hierarchy
    const cleanupTx = db.transaction(() => {
      try {
        // Delete auto-discovered sub-mob children relationships
        db.exec("DELETE FROM mob_children WHERE child_mob_id LIKE 'auto-%'");
        // Delete auto-discovered sub-mobs and their components
        db.exec("DELETE FROM mob_components WHERE mob_id LIKE 'auto-%'");
        db.exec("DELETE FROM mobs WHERE id LIKE 'auto-%'");
        // Delete auto-created parent mobs (created by autoDiscoverHierarchy, not manual)
        db.exec("DELETE FROM mob_components WHERE mob_id IN (SELECT id FROM mobs WHERE author = 'whizmob-auto')");
        db.exec("DELETE FROM mobs WHERE author = 'whizmob-auto'");
      } catch { /* tables may not exist */ }
    });
    cleanupTx();

    const insertTx = db.transaction(() => {
      for (const mob of discoveredMobs) {
        // Check if this discovered mob overlaps with an existing manually-defined mob
        let manualParentId: string | null = null;
        const mobMemberSet = new Set(mob.members);

        for (const [existId, existMob] of existingMobs) {
          // Check overlap: if >50% of existing mob's members are in this discovered mob
          let overlap = 0;
          for (const pid of existMob.memberIds) {
            if (mobMemberSet.has(pid)) overlap++;
          }
          if (existMob.memberIds.size > 0 && overlap / existMob.memberIds.size > 0.5) {
            // Prefer mobs that are parents (have hierarchy) over child mobs
            if (existingParents.has(existId)) {
              manualParentId = existId;
              break; // Parent with hierarchy — highest priority match
            }
            if (!manualParentId) {
              manualParentId = existId;
            }
          }
        }

        // If this mob already has manual hierarchy, skip auto-discovery
        if (manualParentId && existingParents.has(manualParentId)) {
          skippedManual++;
          continue;
        }

        // Run sub-mob discovery on this connected component
        const autoSubMobs = discoverSubMobs(mob.members, edges, passportInfo);
        if (autoSubMobs.length === 0) continue;

        // Determine parent mob ID — use existing manual mob or create a discovered one
        const parentId = manualParentId || mob.id;

        // Create parent mob if it doesn't exist
        if (!manualParentId) {
          db.prepare(
            `INSERT OR IGNORE INTO mobs (id, name, description, author)
             VALUES (?, ?, ?, ?)`
          ).run(mob.id, mob.name, `Auto-discovered mob with ${mob.members.length} components`, 'whizmob-auto');

          // Add all members as components of the parent
          const addComp = db.prepare(
            `INSERT OR IGNORE INTO mob_components (mob_id, passport_id, component_type, file_path, role)
             VALUES (?, ?, 'passport', NULL, NULL)`
          );
          for (const memberId of mob.members) {
            const pType = passportTypes.get(memberId) || 'subagent';
            addComp.run(mob.id, memberId);
          }
          parentCount++;
        }

        // Create sub-mobs and add as children
        for (let i = 0; i < autoSubMobs.length; i++) {
          const sub = autoSubMobs[i];

          // Create sub-mob
          db.prepare(
            `INSERT OR IGNORE INTO mobs (id, name, description, author)
             VALUES (?, ?, ?, ?)`
          ).run(sub.id, sub.name, sub.description, 'whizmob-auto');

          // Add members to sub-mob
          const addComp = db.prepare(
            `INSERT OR IGNORE INTO mob_components (mob_id, passport_id, component_type, file_path, role)
             VALUES (?, ?, 'passport', NULL, NULL)`
          );
          for (const memberId of sub.member_ids) {
            addComp.run(sub.id, memberId);
          }

          // Add as child of parent
          db.prepare(
            `INSERT OR IGNORE INTO mob_children (parent_mob_id, child_mob_id, display_order)
             VALUES (?, ?, ?)`
          ).run(parentId, sub.id, i);

          subMobCount++;
        }
      }
    });

    insertTx();

    return { parentMobs: parentCount, subMobs: subMobCount, skippedManual };
  } finally {
    db.close();
  }
}
