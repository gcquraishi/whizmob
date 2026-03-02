/**
 * tests/edges.test.ts
 *
 * Tests for the edge inference engine. Creates fixture passports with
 * source files containing cross-references, then verifies edges are
 * correctly inferred.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferEdges } from '../src/edges.js';
import type { ProtoPassport } from '../src/types.js';

const FIXTURE_DIR = join(tmpdir(), `whizmob-edges-test-${process.pid}`);

function makePassport(overrides: Partial<ProtoPassport> & { id: string; source_file: string }): ProtoPassport {
  return {
    name: overrides.id,
    type: 'skill',
    platform: 'claude-code',
    scope: 'user',
    purpose: 'test',
    status: 'active',
    tags: [],
    metadata: {},
    invocation: null,
    model_hint: null,
    ...overrides,
  };
}

function createFixtures(): void {
  mkdirSync(FIXTURE_DIR, { recursive: true });
}

function removeFixtures(): void {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

describe('edge inference', () => {
  before(createFixtures);
  after(removeFixtures);

  test('detects file path references between passports', async () => {
    const skillAPath = join(FIXTURE_DIR, 'skill-a.md');
    const skillBPath = join(FIXTURE_DIR, 'skill-b.md');

    // Skill A references Skill B's source file path
    writeFileSync(skillAPath, `Read the file at ${skillBPath} for more info.`, 'utf-8');
    writeFileSync(skillBPath, 'I am skill B.', 'utf-8');

    const passports = [
      makePassport({ id: 'skill-a', source_file: skillAPath }),
      makePassport({ id: 'skill-b', source_file: skillBPath }),
    ];

    const edges = await inferEdges(passports);
    const ref = edges.find(e => e.source_id === 'skill-a' && e.target_id === 'skill-b');
    assert.ok(ref, 'Expected edge from skill-a referencing skill-b');
    assert.equal(ref.edge_type, 'references');
  });

  test('detects tilde-form path references', async () => {
    const agentPath = join(FIXTURE_DIR, 'agent.md');
    const configPath = join(FIXTURE_DIR, 'config.json');

    const tildeConfig = configPath.replace(process.env.HOME || '~', '~');
    writeFileSync(agentPath, `Load config from ${tildeConfig}`, 'utf-8');
    writeFileSync(configPath, '{}', 'utf-8');

    const passports = [
      makePassport({ id: 'agent', source_file: agentPath }),
      makePassport({ id: 'config', source_file: configPath }),
    ];

    const edges = await inferEdges(passports);
    const ref = edges.find(e => e.source_id === 'agent' && e.target_id === 'config');
    assert.ok(ref, 'Expected edge from agent referencing config via tilde path');
  });

  test('detects skill invocation patterns', async () => {
    const sprintPath = join(FIXTURE_DIR, 'sprint.md');
    const closePath = join(FIXTURE_DIR, 'close.md');

    writeFileSync(sprintPath, 'When done, run `/close` to finalize the session.', 'utf-8');
    writeFileSync(closePath, 'Session close protocol.', 'utf-8');

    const passports = [
      makePassport({ id: 'skill-sprint', source_file: sprintPath, invocation: '/sprint' }),
      makePassport({ id: 'skill-close', source_file: closePath, invocation: '/close' }),
    ];

    const edges = await inferEdges(passports);
    const invocation = edges.find(
      e => e.source_id === 'skill-sprint' && e.target_id === 'skill-close' && e.edge_type === 'invokes'
    );
    assert.ok(invocation, 'Expected invocation edge from sprint to close');
    assert.equal(invocation.evidence, '/close');
  });

  test('does not create self-referencing edges', async () => {
    const path = join(FIXTURE_DIR, 'self-ref.md');
    writeFileSync(path, `Read ${path} for recursive reference.`, 'utf-8');

    const passports = [
      makePassport({ id: 'self-ref', source_file: path }),
    ];

    const edges = await inferEdges(passports);
    assert.equal(edges.length, 0, 'Should not create self-referencing edges');
  });

  test('detects shared state between passports', async () => {
    const aPath = join(FIXTURE_DIR, 'shared-a.md');
    const bPath = join(FIXTURE_DIR, 'shared-b.md');

    writeFileSync(aPath, 'Read cofounder/memory.json for state.', 'utf-8');
    writeFileSync(bPath, 'Write to cofounder/memory.json after session.', 'utf-8');

    const passports = [
      makePassport({ id: 'shared-a', source_file: aPath }),
      makePassport({ id: 'shared-b', source_file: bPath }),
    ];

    const edges = await inferEdges(passports);
    const shared = edges.find(
      e => e.evidence === 'shared:cofounder/memory.json'
    );
    assert.ok(shared, 'Expected shared state edge for cofounder/memory.json');
  });

  test('deduplicates edges with same source, target, type, and evidence', async () => {
    const aPath = join(FIXTURE_DIR, 'dedup-a.md');
    const bPath = join(FIXTURE_DIR, 'dedup-b.md');

    // Reference the same path twice in the content
    writeFileSync(aPath, `First: ${bPath}\nSecond: ${bPath}`, 'utf-8');
    writeFileSync(bPath, 'target', 'utf-8');

    const passports = [
      makePassport({ id: 'dedup-a', source_file: aPath }),
      makePassport({ id: 'dedup-b', source_file: bPath }),
    ];

    const edges = await inferEdges(passports);
    const refs = edges.filter(e => e.source_id === 'dedup-a' && e.target_id === 'dedup-b' && e.edge_type === 'references');
    assert.equal(refs.length, 1, 'Should deduplicate identical edges');
  });

  test('handles unreadable source files gracefully', async () => {
    const passports = [
      makePassport({ id: 'missing', source_file: join(FIXTURE_DIR, 'does-not-exist.md') }),
    ];

    const edges = await inferEdges(passports);
    assert.equal(edges.length, 0, 'Should return empty edges for unreadable files');
  });

  test('invocation matching requires word boundaries', async () => {
    const aPath = join(FIXTURE_DIR, 'boundary-a.md');
    const bPath = join(FIXTURE_DIR, 'boundary-b.md');

    // "/review" should not match "/review-pr" as a substring
    writeFileSync(aPath, 'Run /review-pr to check the pull request.', 'utf-8');
    writeFileSync(bPath, 'Review code.', 'utf-8');

    const passports = [
      makePassport({ id: 'boundary-a', source_file: aPath }),
      makePassport({ id: 'skill-review', source_file: bPath, invocation: '/review' }),
    ];

    const edges = await inferEdges(passports);
    const invocation = edges.find(e => e.edge_type === 'invokes' && e.target_id === 'skill-review');
    // /review should not match when followed by -pr (not a word boundary)
    assert.ok(!invocation, 'Should not match /review inside /review-pr');
  });
});
