import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';

const DEFAULT_DB_PATH = join(homedir(), '.whizmob', 'whizmob.db');

function resolveDbPath(): string {
  return process.env.WHIZMOB_DB_PATH || DEFAULT_DB_PATH;
}

interface SubMobInfo {
  id: string;
  name: string;
  member_ids: string[];
}

interface DiscoveredMob {
  id: string;
  name: string;
  members: Array<{
    passport_id: string;
    name: string;
    type: string;
    purpose: string;
    invocation: string | null;
    source_file: string;
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

interface Stats {
  total: number;
  edgeCount: number;
  platformCount: number;
}

function getDiscoveredMobs(): DiscoveredMob[] {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true });

  try {
    // Get all edges
    let edgeRows: Array<{ source_id: string; target_id: string; edge_type: string; evidence: string }> = [];
    try {
      edgeRows = db.prepare('SELECT source_id, target_id, edge_type, evidence FROM edges').all() as typeof edgeRows;
    } catch {
      return [];
    }

    if (edgeRows.length === 0) return [];

    // Get passport types to filter out project/settings
    const passportTypes = new Map<string, string>();
    for (const row of db.prepare('SELECT id, type FROM passports').all() as { id: string; type: string }[]) {
      passportTypes.set(row.id, row.type);
    }
    const excludedTypes = new Set(['project', 'settings']);

    // Filter edges
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

    // BFS connected components
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

    // Build mobs
    const mobs: DiscoveredMob[] = [];
    for (const memberIds of components) {
      if (memberIds.length < 2) continue;

      const memberSet = new Set(memberIds);
      const placeholders = memberIds.map(() => '?').join(', ');
      const passportRows = db.prepare(
        `SELECT id, name, type, purpose, invocation, source_file FROM passports WHERE id IN (${placeholders})`
      ).all(...memberIds) as Array<{ id: string; name: string; type: string; purpose: string; invocation: string | null; source_file: string }>;

      const members = passportRows.map(r => ({
        passport_id: r.id,
        name: r.name,
        type: r.type,
        purpose: r.purpose,
        invocation: r.invocation,
        source_file: r.source_file,
      }));

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

    mobs.sort((a, b) => b.members.length - a.members.length);

    // Enrich mobs with hierarchy data from mob_children table
    try {
      const childRows = db.prepare(`
        SELECT mc.parent_mob_id, mc.child_mob_id, mc.display_order,
               m.name, m.description
        FROM mob_children mc
        JOIN mobs m ON mc.child_mob_id = m.id
        ORDER BY mc.display_order, m.name
      `).all() as Array<{ parent_mob_id: string; child_mob_id: string; display_order: number; name: string; description: string }>;

      if (childRows.length > 0) {
        const parentChildren = new Map<string, SubMobInfo[]>();
        for (const row of childRows) {
          if (!parentChildren.has(row.parent_mob_id)) parentChildren.set(row.parent_mob_id, []);
          parentChildren.get(row.parent_mob_id)!.push({
            id: row.child_mob_id,
            name: row.name,
            member_ids: [],
          });
        }

        // Get component-to-sub-mob mapping
        const compRows = db.prepare(`
          SELECT mc2.mob_id as sub_mob_id, mc2.passport_id
          FROM mob_components mc2
          WHERE mc2.passport_id IS NOT NULL
            AND mc2.mob_id IN (SELECT child_mob_id FROM mob_children)
        `).all() as Array<{ sub_mob_id: string; passport_id: string }>;

        const subMobMembers = new Map<string, Set<string>>();
        for (const row of compRows) {
          if (!subMobMembers.has(row.sub_mob_id)) subMobMembers.set(row.sub_mob_id, new Set());
          subMobMembers.get(row.sub_mob_id)!.add(row.passport_id);
        }

        // For each discovered mob, check overlap with defined parent mobs
        for (const mob of mobs) {
          const mobMemberIds = new Set(mob.members.map(m => m.passport_id));

          for (const [parentId, children] of parentChildren) {
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

            let overlap = 0;
            for (const pid of allChildPassportIds) {
              if (mobMemberIds.has(pid)) overlap++;
            }

            if (allChildPassportIds.size > 0 && overlap / allChildPassportIds.size > 0.5) {
              mob.children = children.map(c => ({
                ...c,
                member_ids: c.member_ids.filter(pid => mobMemberIds.has(pid)),
              }));

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
              const nameRow = db.prepare('SELECT name FROM mobs WHERE id = ?').get(parentId) as { name: string } | undefined;
              if (nameRow) {
                mob.name = nameRow.name;
              }

              break;
            }
          }
        }
      }
    } catch {
      // mob_children table may not exist — hierarchy enrichment is optional
    }

    return mobs;
  } finally {
    db.close();
  }
}

function getStats(): Stats {
  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) return { total: 0, edgeCount: 0, platformCount: 0 };
  const db = new Database(dbPath, { readonly: true });

  try {
    const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM passports').get() as { cnt: number };
    let edgeCount = 0;
    try {
      const edgeRow = db.prepare('SELECT COUNT(*) as cnt FROM edges').get() as { cnt: number };
      edgeCount = edgeRow.cnt;
    } catch { /* table may not exist */ }
    const platformRow = db.prepare('SELECT COUNT(DISTINCT platform) as cnt FROM passports').get() as { cnt: number };
    return { total: totalRow.cnt, edgeCount, platformCount: platformRow.cnt };
  } finally {
    db.close();
  }
}

function toDisplayPath(filePath: string): string {
  return filePath.replace(/^\/Users\/[^/]+/, '~');
}

function generateDemoHtml(mobs: DiscoveredMob[], stats: Stats): string {
  // Sanitize data for embedding — strip source_file paths to display-safe versions
  const safeMobs = mobs.map(mob => ({
    ...mob,
    members: mob.members.map(m => ({
      ...m,
      source_file: toDisplayPath(m.source_file),
    })),
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Whizmob — Mob Inspector</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f9fafb; color: #111827; -webkit-font-smoothing: antialiased;
  }

  /* Nav */
  .nav {
    height: 48px; background: #fff; border-bottom: 1px solid #e5e7eb;
    display: flex; align-items: center; padding: 0 16px; gap: 16px;
  }
  .nav-brand { font-weight: 700; font-size: 14px; color: #111827; }
  .nav-badge {
    font-size: 10px; background: #f3f4f6; color: #6b7280;
    padding: 2px 8px; border-radius: 9999px;
  }

  /* Layout */
  .inspector { display: flex; height: calc(100vh - 48px); }

  /* Left panel */
  .mob-list {
    width: 260px; border-right: 1px solid #e5e7eb; background: rgba(249,250,251,0.5);
    display: flex; flex-direction: column; flex-shrink: 0;
  }
  .mob-list-header {
    padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
    font-size: 11px; font-weight: 600; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.05em;
    display: flex; justify-content: space-between; align-items: center;
  }
  .mob-list-count {
    font-size: 10px; background: #f3f4f6; color: #9ca3af;
    padding: 1px 6px; border-radius: 9999px;
  }
  .mob-list-items { flex: 1; overflow-y: auto; }
  .mob-item {
    width: 100%; text-align: left; padding: 12px 16px;
    border: none; background: none; cursor: pointer;
    border-bottom: 1px solid #f3f4f6; border-left: 2px solid transparent;
    transition: background 0.15s;
  }
  .mob-item:hover { background: #fff; }
  .mob-item.selected { background: #fff; border-left-color: #6366f1; }
  .mob-item-name { font-size: 14px; font-weight: 500; color: #111827; }
  .mob-item-meta { font-size: 11px; color: #9ca3af; margin-top: 4px; }

  /* Right panel */
  .detail { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  /* Graph */
  .graph-container { height: 45%; padding: 16px 16px 8px; flex-shrink: 0; }
  .graph-canvas {
    width: 100%; height: 100%; background: #fff;
    border-radius: 8px; border: 1px solid #e5e7eb;
  }

  /* Cards */
  .cards-container {
    flex: 1; overflow-y: auto; padding: 8px 16px 16px;
    border-top: 1px solid #f3f4f6;
  }
  .cards-header {
    font-size: 11px; font-weight: 600; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;
  }
  .cards-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;
  }
  .card {
    border-radius: 8px; border: 1px solid #e5e7eb; padding: 16px;
    background: #fff; cursor: pointer; transition: all 0.2s;
  }
  .card:hover { border-color: #d1d5db; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .card.highlighted {
    border-color: #a5b4fc; background: rgba(238,242,255,0.3);
    box-shadow: 0 0 0 1px #c7d2fe;
  }
  .card-header { display: flex; align-items: center; gap: 8px; }
  .card-name { font-size: 14px; font-weight: 600; color: #111827; }
  .card-type {
    font-size: 10px; font-weight: 500; padding: 2px 6px; border-radius: 4px;
  }
  .card-purpose { font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
  .card-meta {
    margin-top: 12px; display: flex; flex-wrap: wrap; gap: 12px;
    font-size: 11px; color: #9ca3af;
  }
  .card-meta span { display: flex; align-items: center; gap: 4px; }

  /* Type colors */
  .type-subagent { background: #eef2ff; color: #4338ca; }
  .type-skill { background: #ecfdf5; color: #047857; }
  .type-mcp { background: #fffbeb; color: #b45309; }
  .type-extension { background: #f5f3ff; color: #6d28d9; }
  .type-project { background: #f9fafb; color: #6b7280; }
  .type-settings { background: #f9fafb; color: #9ca3af; }

  /* Empty state */
  .empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    text-align: center; color: #6b7280;
  }
  .empty h2 { font-size: 16px; font-weight: 600; color: #111827; margin-bottom: 4px; }
  .empty p { font-size: 14px; }
  .empty code {
    display: inline-block; margin-top: 12px; padding: 6px 12px;
    background: #f3f4f6; border-radius: 6px; font-family: monospace; font-size: 13px;
  }

  /* Sub-mob legend */
  .legend {
    display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px 0;
  }
  .legend-btn {
    display: flex; align-items: center; gap: 4px; padding: 3px 8px;
    border-radius: 9999px; border: 1px solid #e5e7eb; background: #fff;
    font-size: 11px; color: #374151; cursor: pointer; transition: all 0.15s;
  }
  .legend-btn:hover { border-color: #d1d5db; }
  .legend-btn.active { border-color: currentColor; font-weight: 600; }
  .legend-dot {
    width: 8px; height: 8px; border-radius: 50%;
  }
  .legend-clear {
    padding: 3px 8px; border-radius: 9999px; border: 1px solid #e5e7eb;
    background: #fff; font-size: 11px; color: #9ca3af; cursor: pointer;
  }

  /* Sub-mob filter header */
  .cards-header-row {
    display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
  }
  .show-all-btn {
    font-size: 11px; color: #9ca3af; background: none; border: none;
    cursor: pointer; padding: 0;
  }
  .show-all-btn:hover { color: #6b7280; }

  /* Footer */
  .footer {
    padding: 8px 16px; border-top: 1px solid #e5e7eb; text-align: center;
    font-size: 11px; color: #9ca3af;
  }
  .footer a { color: #6366f1; text-decoration: none; }
  .footer a:hover { text-decoration: underline; }
</style>
</head>
<body>
<nav class="nav">
  <span class="nav-brand">whizmob</span>
  <span class="nav-badge">${stats.total} components &middot; ${stats.edgeCount} edges &middot; ${mobs.length} mobs</span>
  <span class="nav-badge">demo</span>
</nav>

<div id="app"></div>
<div class="footer">
  Generated by <a href="https://github.com/gcquraishi/whizmob">whizmob</a> &middot;
  Install: <code>npx whizmob scan && npx whizmob dashboard</code>
</div>

<script>
const MOBS = ${JSON.stringify(safeMobs)};

const TYPE_COLORS = {
  subagent: '#6366f1', skill: '#059669', mcp: '#d97706',
  project: '#6b7280', settings: '#9ca3af', extension: '#8b5cf6',
};
const TYPE_LABELS = {
  subagent: 'Agent', skill: 'Skill', mcp: 'MCP',
  project: 'Project', settings: 'Settings', extension: 'Extension',
};
const SUB_MOB_COLORS = [
  { fill: 'rgba(99,102,241,0.08)', stroke: 'rgba(99,102,241,0.25)', text: '#6366f1' },
  { fill: 'rgba(5,150,105,0.08)', stroke: 'rgba(5,150,105,0.25)', text: '#059669' },
  { fill: 'rgba(217,119,6,0.08)', stroke: 'rgba(217,119,6,0.25)', text: '#d97706' },
  { fill: 'rgba(139,92,246,0.08)', stroke: 'rgba(139,92,246,0.25)', text: '#8b5cf6' },
  { fill: 'rgba(236,72,153,0.08)', stroke: 'rgba(236,72,153,0.25)', text: '#ec4899' },
  { fill: 'rgba(14,165,233,0.08)', stroke: 'rgba(14,165,233,0.25)', text: '#0ea5e9' },
  { fill: 'rgba(245,158,11,0.08)', stroke: 'rgba(245,158,11,0.25)', text: '#f59e0b' },
  { fill: 'rgba(168,85,247,0.08)', stroke: 'rgba(168,85,247,0.25)', text: '#a855f7' },
];

let selectedMobId = MOBS.length > 0 ? MOBS[0].id : null;
let highlightedNode = null;
let activeSubMob = null;

function convexHull(points) {
  if (points.length <= 1) return points.slice();
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
  const lower = [];
  for (const p of points) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper = [];
  for (let i = points.length - 1; i >= 0; i--) { const p = points[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function render() {
  const app = document.getElementById('app');

  if (MOBS.length === 0) {
    app.innerHTML = '<div class="empty"><div><h2>No mobs discovered</h2><p>Run a scan to discover your agent systems.</p><code>npx whizmob scan</code></div></div>';
    app.style.height = 'calc(100vh - 48px)';
    return;
  }

  const mob = MOBS.find(m => m.id === selectedMobId) || MOBS[0];

  const filteredMembers = activeSubMob
    ? mob.members.filter(m => m.sub_mob_ids && m.sub_mob_ids.includes(activeSubMob))
    : mob.members;
  const hasChildren = mob.children && mob.children.length > 0;
  const activeChild = hasChildren && activeSubMob ? mob.children.find(c => c.id === activeSubMob) : null;

  app.innerHTML = '<div class="inspector">' +
    '<div class="mob-list">' +
      '<div class="mob-list-header">Discovered Mobs <span class="mob-list-count">' + MOBS.length + '</span></div>' +
      '<div class="mob-list-items">' +
        MOBS.map(m => {
          const subCount = m.children ? m.children.length : 0;
          return '<button class="mob-item' + (m.id === selectedMobId ? ' selected' : '') + '" data-mob="' + m.id + '">' +
            '<div class="mob-item-name">' + esc(m.name) + '</div>' +
            '<div class="mob-item-meta">' + m.members.length + ' agents &middot; ' + m.edges.length + ' connections' +
              (subCount > 0 ? ' &middot; ' + subCount + ' sub-mobs' : '') +
            '</div>' +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="detail">' +
      '<div class="graph-container"><canvas id="graph" class="graph-canvas"></canvas></div>' +
      (hasChildren ? '<div class="legend">' +
        mob.children.map((c, i) => {
          const color = SUB_MOB_COLORS[i % SUB_MOB_COLORS.length];
          return '<button class="legend-btn' + (activeSubMob === c.id ? ' active' : '') + '" data-submob="' + c.id + '" style="color:' + color.text + '">' +
            '<span class="legend-dot" style="background:' + color.text + '"></span>' + esc(c.name) +
          '</button>';
        }).join('') +
        (activeSubMob ? '<button class="legend-clear" data-submob-clear>Clear</button>' : '') +
      '</div>' : '') +
      '<div class="cards-container">' +
        '<div class="cards-header-row">' +
          '<div class="cards-header">' +
            (activeChild ? esc(activeChild.name) + ' Components' : 'Components &middot; ' + mob.members.length) +
          '</div>' +
          (activeSubMob ? '<button class="show-all-btn" data-submob-clear>Show all</button>' : '') +
        '</div>' +
        '<div class="cards-grid">' +
          filteredMembers.map(m => {
            const conns = mob.edges.filter(e => e.source_id === m.passport_id || e.target_id === m.passport_id).length;
            const typeClass = 'type-' + m.type;
            const label = TYPE_LABELS[m.type] || m.type;
            return '<div class="card' + (highlightedNode === m.passport_id ? ' highlighted' : '') + '" data-node="' + m.passport_id + '">' +
              '<div class="card-header">' +
                '<span class="card-name">' + esc(m.name) + '</span>' +
                '<span class="card-type ' + typeClass + '">' + label + '</span>' +
              '</div>' +
              '<div class="card-purpose">' + esc(m.purpose).substring(0, 120) + '</div>' +
              '<div class="card-meta">' +
                (m.invocation ? '<span>' + esc(m.invocation) + '</span>' : '') +
                '<span>' + esc(m.source_file.split('/').pop()) + '</span>' +
                '<span>' + conns + ' connection' + (conns !== 1 ? 's' : '') + '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  // Bind mob list clicks
  for (const btn of document.querySelectorAll('.mob-item')) {
    btn.addEventListener('click', () => {
      selectedMobId = btn.getAttribute('data-mob');
      highlightedNode = null;
      activeSubMob = null;
      render();
    });
  }

  // Bind sub-mob legend clicks
  for (const btn of document.querySelectorAll('[data-submob]')) {
    btn.addEventListener('click', () => {
      activeSubMob = btn.getAttribute('data-submob') === activeSubMob ? null : btn.getAttribute('data-submob');
      render();
    });
  }
  for (const btn of document.querySelectorAll('[data-submob-clear]')) {
    btn.addEventListener('click', () => { activeSubMob = null; render(); });
  }

  // Bind card clicks
  for (const card of document.querySelectorAll('.card')) {
    card.addEventListener('click', () => {
      highlightedNode = card.getAttribute('data-node');
      render();
    });
  }

  // Start graph simulation
  startGraph(mob);
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function startGraph(mob) {
  const canvas = document.getElementById('graph');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const w = rect.width;
  const h = rect.height;

  // Build sub-mob lookup for nodes
  const subMobMap = new Map();
  const subMobColorMap = new Map();
  if (mob.children) {
    mob.children.forEach((c, i) => {
      subMobColorMap.set(c.id, SUB_MOB_COLORS[i % SUB_MOB_COLORS.length]);
      for (const pid of c.member_ids) {
        if (!subMobMap.has(pid)) subMobMap.set(pid, []);
        subMobMap.get(pid).push(c.id);
      }
    });
  }

  const nodes = mob.members.map((m, i) => {
    const angle = (i / mob.members.length) * Math.PI * 2;
    const r = Math.min(w, h) * 0.3;
    return {
      id: m.passport_id, label: m.name, type: m.type,
      sub_mob_ids: m.sub_mob_ids || [],
      x: w / 2 + Math.cos(angle) * r,
      y: h / 2 + Math.sin(angle) * r,
      vx: 0, vy: 0, radius: 8,
    };
  });

  const edgeSet = new Set();
  for (const e of mob.edges) {
    edgeSet.add(e.source_id + '|' + e.target_id);
    edgeSet.add(e.target_id + '|' + e.source_id);
  }

  let dragNode = null;

  canvas.addEventListener('mousedown', (e) => {
    const pos = getPos(e);
    dragNode = nodes.find(n => dist(n, pos) < n.radius + 4) || null;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (dragNode) {
      const pos = getPos(e);
      dragNode.x = pos.x;
      dragNode.y = pos.y;
      dragNode.vx = 0;
      dragNode.vy = 0;
    }
    const pos = getPos(e);
    const hovered = nodes.find(n => dist(n, pos) < n.radius + 4);
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  });
  canvas.addEventListener('mouseup', () => { dragNode = null; });
  canvas.addEventListener('mouseleave', () => { dragNode = null; });
  canvas.addEventListener('click', (e) => {
    const pos = getPos(e);
    const clicked = nodes.find(n => dist(n, pos) < n.radius + 4);
    if (clicked) {
      highlightedNode = clicked.id;
      render();
    }
  });

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

  function simulate() {
    const centerX = w / 2;
    const centerY = h / 2;

    for (const node of nodes) {
      if (node === dragNode) continue;
      let fx = 0, fy = 0;

      fx += (centerX - node.x) * 0.005;
      fy += (centerY - node.y) * 0.005;

      for (const other of nodes) {
        if (other.id === node.id) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = 3000 / (d * d);
        fx += (dx / d) * force;
        fy += (dy / d) * force;
      }

      for (const other of nodes) {
        if (other.id === node.id) continue;
        if (edgeSet.has(node.id + '|' + other.id)) {
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const force = (d - 120) * 0.01;
          fx += (dx / d) * force;
          fy += (dy / d) * force;
        }
      }

      // Sub-mob cohesion: attract siblings in the same sub-mob
      if (node.sub_mob_ids.length > 0) {
        for (const other of nodes) {
          if (other.id === node.id || other.sub_mob_ids.length === 0) continue;
          const shared = node.sub_mob_ids.some(s => other.sub_mob_ids.includes(s));
          if (shared) {
            const dx = other.x - node.x;
            const dy = other.y - node.y;
            const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            fx += (dx / d) * 0.3;
            fy += (dy / d) * 0.3;
          }
        }
      }

      node.vx = (node.vx + fx) * 0.85;
      node.vy = (node.vy + fy) * 0.85;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(20, Math.min(w - 20, node.x));
      node.y = Math.max(20, Math.min(h - 20, node.y));
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw sub-mob hulls
    if (mob.children) {
      const nodeMap2 = new Map(nodes.map(n => [n.id, n]));
      mob.children.forEach((child, ci) => {
        const color = SUB_MOB_COLORS[ci % SUB_MOB_COLORS.length];
        const pts = child.member_ids
          .map(id => nodeMap2.get(id))
          .filter(Boolean)
          .map(n => ({ x: n.x, y: n.y }));
        if (pts.length === 0) return;

        const isActive = !activeSubMob || activeSubMob === child.id;
        const alpha = isActive ? 1 : 0.3;

        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 30, 0, Math.PI * 2);
          ctx.fillStyle = color.fill.replace(/[\\d.]+\\)$/, (0.08 * alpha) + ')');
          ctx.fill();
          ctx.strokeStyle = color.stroke.replace(/[\\d.]+\\)$/, (0.25 * alpha) + ')');
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (pts.length === 2) {
          const pad = 25;
          const dx = pts[1].x - pts[0].x;
          const dy = pts[1].y - pts[0].y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len * pad;
          const ny = dx / len * pad;
          ctx.beginPath();
          ctx.moveTo(pts[0].x + nx, pts[0].y + ny);
          ctx.lineTo(pts[1].x + nx, pts[1].y + ny);
          ctx.lineTo(pts[1].x - nx, pts[1].y - ny);
          ctx.lineTo(pts[0].x - nx, pts[0].y - ny);
          ctx.closePath();
          ctx.fillStyle = color.fill.replace(/[\\d.]+\\)$/, (0.08 * alpha) + ')');
          ctx.fill();
          ctx.strokeStyle = color.stroke.replace(/[\\d.]+\\)$/, (0.25 * alpha) + ')');
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          const hull = convexHull(pts.map(p => ({ x: p.x, y: p.y })));
          if (hull.length < 3) return;
          // Expand hull outward by padding
          const pad = 25;
          const cx2 = hull.reduce((s, p) => s + p.x, 0) / hull.length;
          const cy2 = hull.reduce((s, p) => s + p.y, 0) / hull.length;
          const expanded = hull.map(p => {
            const ddx = p.x - cx2;
            const ddy = p.y - cy2;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            return { x: p.x + (ddx / dd) * pad, y: p.y + (ddy / dd) * pad };
          });
          ctx.beginPath();
          ctx.moveTo(expanded[0].x, expanded[0].y);
          for (let i = 1; i < expanded.length; i++) {
            ctx.lineTo(expanded[i].x, expanded[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = color.fill.replace(/[\\d.]+\\)$/, (0.08 * alpha) + ')');
          ctx.fill();
          ctx.strokeStyle = color.stroke.replace(/[\\d.]+\\)$/, (0.25 * alpha) + ')');
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });
    }

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const e of mob.edges) {
      const s = nodeMap.get(e.source_id);
      const t = nodeMap.get(e.target_id);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = e.edge_type === 'invokes' ? 'rgba(99,102,241,0.3)' : 'rgba(156,163,175,0.2)';
      ctx.lineWidth = e.edge_type === 'invokes' ? 1.5 : 1;
      ctx.stroke();
    }

    for (const node of nodes) {
      const isHL = node.id === highlightedNode;
      const isShared = node.sub_mob_ids.length > 1;
      const isDimmed = activeSubMob && node.sub_mob_ids.length > 0 && !node.sub_mob_ids.includes(activeSubMob);
      const r = isHL ? 12 : node.radius;
      const color = TYPE_COLORS[node.type] || '#6b7280';
      const alpha = isDimmed ? 0.25 : 1;

      if (isHL) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      // Shared component amber ring
      if (isShared && !isDimmed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill();

      ctx.fillStyle = '#374151';
      ctx.font = (isHL ? '12' : '10') + 'px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + r + 14);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
    requestAnimationFrame(simulate);
  }

  requestAnimationFrame(simulate);
}

render();
</script>
</body>
</html>`;
}

export function generateDemo(outputPath?: string): { path: string; mobCount: number; memberCount: number } {
  const mobs = getDiscoveredMobs();
  const stats = getStats();
  const html = generateDemoHtml(mobs, stats);

  const outDir = join(homedir(), '.whizmob');
  mkdirSync(outDir, { recursive: true });

  const outPath = outputPath || join(outDir, 'demo.html');
  writeFileSync(outPath, html, 'utf-8');

  const memberCount = mobs.reduce((sum, m) => sum + m.members.length, 0);
  return { path: outPath, mobCount: mobs.length, memberCount };
}
