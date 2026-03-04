/**
 * tests/auto-discovery.test.ts
 *
 * Tests for the sub-mob auto-discovery algorithm (src/cluster.ts)
 * and the autoDiscoverHierarchy DB integration (src/db.ts).
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSubMobs, type AutoSubMob } from '../src/cluster.js';
import { autoDiscoverHierarchy } from '../src/db.js';
import type { InferredEdge } from '../src/edges.js';
import Database from 'better-sqlite3';
import { SCHEMA, TABLE_MIGRATIONS } from '../src/schema.js';

function makeEdge(
  source: string,
  target: string,
  type: 'references' | 'invokes' | 'reads' | 'writes' = 'references',
  evidence?: string,
): InferredEdge {
  return {
    source_id: source,
    target_id: target,
    edge_type: type,
    evidence: evidence || `${source}->${target}`,
  };
}

function makePassportInfo(id: string, name: string, type = 'skill', invocation: string | null = null) {
  return { id, name, type, invocation };
}

describe('discoverSubMobs', () => {
  test('finds invocation chains as workflow sub-mobs', () => {
    const members = ['a', 'b', 'c', 'd'];
    const edges: InferredEdge[] = [
      makeEdge('a', 'b', 'invokes'),
      makeEdge('b', 'c', 'invokes'),
      makeEdge('a', 'd', 'references'),
    ];
    const info = new Map([
      ['a', makePassportInfo('a', 'Standup')],
      ['b', makePassportInfo('b', 'Briefing')],
      ['c', makePassportInfo('c', 'Sprint')],
      ['d', makePassportInfo('d', 'Other')],
    ]);

    const result = discoverSubMobs(members, edges, info);
    const workflows = result.filter(s => s.pattern === 'invocation-chain');
    assert.ok(workflows.length >= 1, 'Should find at least one invocation chain');
    // a->b->c should be grouped
    const chain = workflows[0];
    assert.ok(chain.member_ids.includes('a'));
    assert.ok(chain.member_ids.includes('b'));
    assert.ok(chain.member_ids.includes('c'));
    assert.ok(chain.name.includes('Workflow'));
  });

  test('finds shared state groups', () => {
    const members = ['a', 'b', 'c'];
    const edges: InferredEdge[] = [
      makeEdge('a', 'b', 'references', 'shared:cofounder/memory.json'),
      makeEdge('a', 'c', 'references'),
    ];
    const info = new Map([
      ['a', makePassportInfo('a', 'Cofounder')],
      ['b', makePassportInfo('b', 'Standup')],
      ['c', makePassportInfo('c', 'Sprint')],
    ]);

    const result = discoverSubMobs(members, edges, info);
    const stateGroups = result.filter(s => s.pattern === 'shared-state');
    assert.ok(stateGroups.length >= 1, 'Should find shared state group');
    assert.ok(stateGroups[0].member_ids.includes('a'));
    assert.ok(stateGroups[0].member_ids.includes('b'));
    assert.ok(stateGroups[0].name.includes('State'));
  });

  test('finds hook trigger groups', () => {
    const members = ['hook1', 'a', 'b'];
    const edges: InferredEdge[] = [
      makeEdge('hook1', 'a', 'references'),
      makeEdge('hook1', 'b', 'references'),
    ];
    const info = new Map([
      ['hook1', makePassportInfo('hook1', 'Panel-Start Hook', 'skill')],
      ['a', makePassportInfo('a', 'Standup')],
      ['b', makePassportInfo('b', 'Sprint')],
    ]);

    const result = discoverSubMobs(members, edges, info);
    const hookGroups = result.filter(s => s.pattern === 'hook-group');
    assert.ok(hookGroups.length >= 1, 'Should find hook group');
    assert.ok(hookGroups[0].member_ids.includes('hook1'));
    assert.ok(hookGroups[0].name.includes('Hook'));
  });

  test('returns empty array when no patterns match', () => {
    const members = ['a', 'b'];
    const edges: InferredEdge[] = [
      makeEdge('a', 'b', 'references'),
    ];
    const info = new Map([
      ['a', makePassportInfo('a', 'Agent A')],
      ['b', makePassportInfo('b', 'Agent B')],
    ]);

    const result = discoverSubMobs(members, edges, info);
    // Only references edge, no invocations, shared state, or hooks
    assert.equal(result.length, 0);
  });

  test('a component can appear in multiple sub-mobs', () => {
    const members = ['a', 'b', 'c', 'hook1'];
    const edges: InferredEdge[] = [
      makeEdge('a', 'b', 'invokes'),
      makeEdge('hook1', 'a', 'references'),
      makeEdge('hook1', 'c', 'references'),
    ];
    const info = new Map([
      ['a', makePassportInfo('a', 'Standup')],
      ['b', makePassportInfo('b', 'Briefing')],
      ['c', makePassportInfo('c', 'Sprint')],
      ['hook1', makePassportInfo('hook1', 'Session-Start Hook')],
    ]);

    const result = discoverSubMobs(members, edges, info);
    // 'a' should appear in both the invocation chain and the hook group
    const allMembers = result.flatMap(s => s.member_ids);
    const aCount = allMembers.filter(id => id === 'a').length;
    assert.ok(aCount >= 2, `'a' should appear in at least 2 sub-mobs, got ${aCount}`);
  });

  test('sub-mob IDs use auto- prefix', () => {
    const members = ['a', 'b', 'c'];
    const edges: InferredEdge[] = [
      makeEdge('a', 'b', 'invokes'),
      makeEdge('b', 'c', 'invokes'),
    ];
    const info = new Map([
      ['a', makePassportInfo('a', 'Standup')],
      ['b', makePassportInfo('b', 'Briefing')],
      ['c', makePassportInfo('c', 'Sprint')],
    ]);

    const result = discoverSubMobs(members, edges, info);
    for (const sub of result) {
      assert.ok(sub.id.startsWith('auto-'), `Sub-mob ID should start with auto-, got ${sub.id}`);
    }
  });
});

describe('autoDiscoverHierarchy', () => {
  let dbPath: string;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `whizmob-test-${process.pid}`);
    mkdirSync(tmpDir, { recursive: true });
    dbPath = join(tmpDir, 'whizmob.db');
    process.env.WHIZMOB_DB_PATH = dbPath;

    // Set up DB with passports and edges
    const db = new Database(dbPath);
    db.exec(SCHEMA);
    try { db.exec(TABLE_MIGRATIONS); } catch { /* already exists */ }

    // Create passports
    const stmt = db.prepare(
      `INSERT INTO passports (id, name, type, platform, scope, purpose, invocation, source_file)
       VALUES (?, ?, ?, 'claude-code', 'user', ?, ?, ?)`
    );
    stmt.run('standup', 'Standup', 'skill', 'Run daily standup', '/standup', '~/.claude/skills/standup/SKILL.md');
    stmt.run('briefing', 'Briefing', 'skill', 'Generate briefing', '/generate-briefing', '~/.claude/skills/briefing/SKILL.md');
    stmt.run('sprint', 'Sprint', 'skill', 'Execute sprint', '/sprint', '~/.claude/skills/sprint/SKILL.md');
    stmt.run('cofounder', 'Cofounder', 'skill', 'Strategic partner', '/cofounder', '~/.claude/skills/cofounder/SKILL.md');
    stmt.run('hook-start', 'Panel Start Hook', 'skill', 'Session hook', null, '~/.claude/hooks/panel-start.sh');
    stmt.run('island', 'Island Agent', 'subagent', 'Isolated agent', null, '~/.claude/agents/island.md');
    db.close();
  });

  afterEach(() => {
    delete process.env.WHIZMOB_DB_PATH;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates auto-discovered sub-mobs from invocation chains', () => {
    const edges: InferredEdge[] = [
      makeEdge('standup', 'briefing', 'invokes'),
      makeEdge('briefing', 'sprint', 'invokes'),
      makeEdge('standup', 'cofounder', 'references'),
      makeEdge('hook-start', 'standup', 'references'),
    ];

    const result = autoDiscoverHierarchy(edges);
    assert.ok(result.subMobs > 0, 'Should discover at least one sub-mob');

    // Verify DB has auto-discovered mobs
    const db = new Database(dbPath, { readonly: true });
    const autoMobs = db.prepare("SELECT id, name FROM mobs WHERE id LIKE 'auto-%'").all() as Array<{ id: string; name: string }>;
    assert.ok(autoMobs.length > 0, 'Should have auto-discovered mobs in DB');

    // Verify parent-child relationships exist
    const children = db.prepare("SELECT * FROM mob_children WHERE child_mob_id LIKE 'auto-%'").all();
    assert.ok(children.length > 0, 'Should have parent-child relationships');

    db.close();
  });

  test('skips mobs with existing manual hierarchy', () => {
    // First create a manual mob with hierarchy
    const db = new Database(dbPath);
    db.prepare("INSERT INTO mobs (id, name, description) VALUES ('manual-parent', 'Manual Parent', 'test')").run();
    db.prepare("INSERT INTO mobs (id, name, description) VALUES ('manual-child', 'Manual Child', 'test')").run();
    db.prepare("INSERT INTO mob_components (mob_id, passport_id, component_type) VALUES ('manual-parent', 'standup', 'passport')").run();
    db.prepare("INSERT INTO mob_components (mob_id, passport_id, component_type) VALUES ('manual-parent', 'briefing', 'passport')").run();
    db.prepare("INSERT INTO mob_components (mob_id, passport_id, component_type) VALUES ('manual-parent', 'sprint', 'passport')").run();
    db.prepare("INSERT INTO mob_components (mob_id, passport_id, component_type) VALUES ('manual-parent', 'cofounder', 'passport')").run();
    db.prepare("INSERT INTO mob_components (mob_id, passport_id, component_type) VALUES ('manual-child', 'standup', 'passport')").run();
    db.prepare("INSERT INTO mob_children (parent_mob_id, child_mob_id, display_order) VALUES ('manual-parent', 'manual-child', 0)").run();
    db.close();

    const edges: InferredEdge[] = [
      makeEdge('standup', 'briefing', 'invokes'),
      makeEdge('briefing', 'sprint', 'invokes'),
      makeEdge('standup', 'cofounder', 'references'),
      makeEdge('hook-start', 'standup', 'references'),
    ];

    const result = autoDiscoverHierarchy(edges);
    assert.ok(result.skippedManual > 0, 'Should skip mob with manual hierarchy');
  });

  test('cleans up previous auto-discovered hierarchy on re-run', () => {
    const edges: InferredEdge[] = [
      makeEdge('standup', 'briefing', 'invokes'),
      makeEdge('briefing', 'sprint', 'invokes'),
      makeEdge('standup', 'cofounder', 'references'),
    ];

    // Run once
    autoDiscoverHierarchy(edges);
    const db1 = new Database(dbPath, { readonly: true });
    const count1 = (db1.prepare("SELECT COUNT(*) as cnt FROM mobs WHERE id LIKE 'auto-%'").get() as { cnt: number }).cnt;
    db1.close();

    // Run again — should not accumulate
    autoDiscoverHierarchy(edges);
    const db2 = new Database(dbPath, { readonly: true });
    const count2 = (db2.prepare("SELECT COUNT(*) as cnt FROM mobs WHERE id LIKE 'auto-%'").get() as { cnt: number }).cnt;
    db2.close();

    assert.equal(count1, count2, 'Re-run should not accumulate auto-discovered mobs');
  });

  test('returns zero sub-mobs for disconnected components', () => {
    // Only isolated island agent, no edges
    const result = autoDiscoverHierarchy([]);
    assert.equal(result.subMobs, 0);
    assert.equal(result.parentMobs, 0);
  });
});
