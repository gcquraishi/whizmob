/**
 * Shared SQLite schema for Ronin.
 *
 * This is the single source of truth for the database structure.
 * Both the CLI (src/db.ts, src/constellation.ts) and the dashboard
 * (dashboard/lib/db.ts) execute these SQL strings — the only difference
 * is the driver:
 *   - CLI:       better-sqlite3 (sync)  → db.exec(SCHEMA)
 *   - Dashboard: sql.js (async)         → database.run(SCHEMA)
 *
 * IMPORTANT: When changing SCHEMA or MIGRATIONS, also update
 * dashboard/lib/db.ts to match. The dashboard cannot import from src/
 * directly because it lives in a separate Next.js build context.
 */

/**
 * Full CREATE TABLE definitions for all Ronin tables.
 * All statements use IF NOT EXISTS so they are safe to run on every startup.
 */
export const SCHEMA = `
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

/**
 * Additive ALTER TABLE migrations for databases created before SCHEMA
 * included the provenance columns inline.
 *
 * Safe to run multiple times — "duplicate column name" errors are silently
 * swallowed by both the CLI (runMigrations in src/db.ts) and dashboard
 * (runMigrations in dashboard/lib/db.ts).
 *
 * New databases created from SCHEMA above already have these columns, so
 * the migrations will no-op immediately.
 */
export const MIGRATIONS = `
-- Provenance fields (M3) — added to passports table
ALTER TABLE passports ADD COLUMN origin TEXT;
ALTER TABLE passports ADD COLUMN author TEXT;
ALTER TABLE passports ADD COLUMN license TEXT;
ALTER TABLE passports ADD COLUMN forked_from TEXT;
`;
