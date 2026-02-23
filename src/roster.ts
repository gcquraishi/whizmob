import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { CATEGORY_LABELS } from './types.js';
import type { AgentType } from './types.js';

const DB_PATH = join(homedir(), '.ronin', 'ronin.db');

interface PassportRow {
  id: string;
  name: string;
  type: string;
  platform: string;
  scope: string;
  purpose: string;
  model_hint: string | null;
  invocation: string | null;
  source_file: string;
}

interface ConstellationMembership {
  passport_id: string;
  constellation_name: string;
}

function getConstellationMemberships(db: Database.Database): Map<string, string[]> {
  const map = new Map<string, string[]>();
  try {
    const rows = db.prepare(`
      SELECT cc.passport_id, c.name as constellation_name
      FROM constellation_components cc
      JOIN constellations c ON cc.constellation_id = c.id
      WHERE cc.passport_id IS NOT NULL
    `).all() as ConstellationMembership[];
    for (const row of rows) {
      const list = map.get(row.passport_id) || [];
      list.push(row.constellation_name);
      map.set(row.passport_id, list);
    }
  } catch {
    // Table may not exist yet
  }
  return map;
}

function openDb(): Database.Database | null {
  if (!existsSync(DB_PATH)) return null;
  return new Database(DB_PATH, { readonly: true });
}

/**
 * Compact roster for SessionStart hook injection.
 * One line per agent, minimal tokens.
 */
export function compactRoster(opts?: { type?: string; platform?: string }): string {
  const db = openDb();
  if (!db) return '# Ronin: No agent database found. Run `ronin scan` first.';

  try {
    let sql = 'SELECT name, type, platform, purpose FROM passports WHERE 1=1';
    const params: (string | number)[] = [];

    if (opts?.type) {
      sql += ' AND type = ?';
      params.push(opts.type);
    }
    if (opts?.platform) {
      sql += ' AND platform = ?';
      params.push(opts.platform);
    }

    sql += ' ORDER BY type, name';
    const rows = db.prepare(sql).all(...params) as PassportRow[];

    if (rows.length === 0) return '# Ronin: No agents found.';

    // Group by type
    const grouped = new Map<string, PassportRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.type) || [];
      list.push(row);
      grouped.set(row.type, list);
    }

    const lines: string[] = [
      `# Ronin Agent Roster (${rows.length} agents)`,
    ];

    for (const [type, agents] of grouped) {
      const label = CATEGORY_LABELS[type as AgentType] || type;
      // Capitalize first letter for heading
      const heading = label.charAt(0).toUpperCase() + label.slice(1);
      lines.push(`## ${heading} (${agents.length})`);
      for (const a of agents) {
        const platform = a.platform !== 'claude-code' ? ` [${a.platform}]` : '';
        // Truncate purpose to keep tokens low
        const purpose = a.purpose.length > 80 ? a.purpose.slice(0, 77) + '...' : a.purpose;
        lines.push(`- **${a.name}**${platform}: ${purpose}`);
      }
    }

    return lines.join('\n');
  } finally {
    db.close();
  }
}

/**
 * Hook-optimized roster for SessionStart injection.
 * Shows only invocable agents (subagents + skills), ultra-compact.
 */
export function hookRoster(): string {
  const db = openDb();
  if (!db) return '';

  try {
    const rows = db.prepare(
      `SELECT id, name, type, platform, purpose, invocation
       FROM passports
       WHERE type IN ('subagent', 'skill')
       ORDER BY type, name`
    ).all() as PassportRow[];

    if (rows.length === 0) return '';

    const memberships = getConstellationMemberships(db);

    // Collect constellation-grouped agents
    const constellationAgents = new Map<string, PassportRow[]>();
    const ungrouped: PassportRow[] = [];

    for (const row of rows) {
      const constellations = memberships.get(row.id);
      if (constellations && constellations.length > 0) {
        for (const cName of constellations) {
          const list = constellationAgents.get(cName) || [];
          list.push(row);
          constellationAgents.set(cName, list);
        }
      } else {
        ungrouped.push(row);
      }
    }

    const lines: string[] = [
      `<ronin-roster agents="${rows.length}">`,
    ];

    // Show constellation groups first
    for (const [cName, agents] of constellationAgents) {
      lines.push(`Constellation: ${cName}`);
      for (const a of agents) {
        const platform = a.platform !== 'claude-code' ? ` [${a.platform}]` : '';
        const invoke = a.invocation ? ` (${a.invocation})` : '';
        const purpose = a.purpose.length > 60 ? a.purpose.slice(0, 57) + '...' : a.purpose;
        lines.push(`  ${a.name}${platform}${invoke} — ${purpose}`);
      }
    }

    // Then ungrouped agents/skills
    const ungroupedSubagents = ungrouped.filter(r => r.type === 'subagent');
    const ungroupedSkills = ungrouped.filter(r => r.type === 'skill');

    if (ungroupedSubagents.length > 0) {
      lines.push('Agents:');
      for (const a of ungroupedSubagents) {
        const platform = a.platform !== 'claude-code' ? ` [${a.platform}]` : '';
        const purpose = a.purpose.length > 60 ? a.purpose.slice(0, 57) + '...' : a.purpose;
        lines.push(`  ${a.name}${platform} — ${purpose}`);
      }
    }

    if (ungroupedSkills.length > 0) {
      lines.push('Skills:');
      for (const a of ungroupedSkills) {
        const platform = a.platform !== 'claude-code' ? ` [${a.platform}]` : '';
        const invoke = a.invocation ? ` (${a.invocation})` : '';
        const purpose = a.purpose.length > 60 ? a.purpose.slice(0, 57) + '...' : a.purpose;
        lines.push(`  ${a.name}${platform}${invoke} — ${purpose}`);
      }
    }

    lines.push('Use `ronin roster --search <name>` or /roster for details.');
    lines.push('</ronin-roster>');

    return lines.join('\n');
  } finally {
    db.close();
  }
}

/**
 * Search roster by name, type, or purpose.
 * Returns detailed results for /roster skill.
 */
export function searchRoster(query: string): string {
  const db = openDb();
  if (!db) return '# Ronin: No agent database found. Run `ronin scan` first.';

  try {
    const term = `%${query}%`;
    const rows = db.prepare(
      `SELECT id, name, type, platform, scope, purpose, model_hint, invocation, source_file
       FROM passports
       WHERE name LIKE ? OR purpose LIKE ? OR type LIKE ? OR id LIKE ?
       ORDER BY
         CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
         type, name`
    ).all(term, term, term, term, term) as PassportRow[];

    if (rows.length === 0) return `# Ronin: No agents matching "${query}"`;

    const memberships = getConstellationMemberships(db);
    const lines: string[] = [`# Ronin: ${rows.length} agent(s) matching "${query}"\n`];

    for (const a of rows) {
      lines.push(`### ${a.name}`);
      lines.push(`- **Type**: ${a.type}`);
      lines.push(`- **Platform**: ${a.platform}`);
      lines.push(`- **Scope**: ${a.scope}`);
      lines.push(`- **Purpose**: ${a.purpose}`);
      if (a.model_hint) lines.push(`- **Model**: ${a.model_hint}`);
      if (a.invocation) lines.push(`- **Invocation**: ${a.invocation}`);
      const constellations = memberships.get(a.id);
      if (constellations && constellations.length > 0) {
        lines.push(`- **Constellations**: ${constellations.join(', ')}`);
      }
      lines.push(`- **Source**: ${a.source_file}`);
      lines.push('');
    }

    return lines.join('\n');
  } finally {
    db.close();
  }
}
