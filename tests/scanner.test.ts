/**
 * tests/scanner.test.ts
 *
 * Creates a minimal fixture directory that mimics ~/.claude/ and verifies
 * the scanner discovers the expected passports from it.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scan } from '../src/scanner.js';

// ── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURE_DIR = join(tmpdir(), `ronin-test-${process.pid}`);

function createFixtures(): void {
  // ~/.claude/agents/test-agent.md
  const agentsDir = join(FIXTURE_DIR, 'claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, 'test-agent.md'),
    [
      '---',
      'name: test-agent',
      'description: A test subagent for unit testing.',
      '---',
      '',
      '# Test Agent',
      '',
      'This agent exists only in the test fixture.',
    ].join('\n'),
    'utf-8',
  );

  // ~/.claude/skills/test-skill/SKILL.md
  const skillDir = join(FIXTURE_DIR, 'claude', 'skills', 'test-skill');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: test-skill',
      'description: A test skill for unit testing.',
      '---',
      '',
      '# Test Skill',
      '',
      'Invoke with /test-skill.',
    ].join('\n'),
    'utf-8',
  );
}

function removeFixtures(): void {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('scanner', () => {
  before(createFixtures);
  after(removeFixtures);

  test('discovers the test subagent from the fixture agents dir', async () => {
    const claudeDir = join(FIXTURE_DIR, 'claude');
    // Use the fixture dir as both scanRoot and claudeDir.
    // codexDir and cursorDir point to an empty dir so those parsers return nothing.
    const emptyDir = join(FIXTURE_DIR, 'empty');
    mkdirSync(emptyDir, { recursive: true });

    const inventory = await scan({
      scanRoot: FIXTURE_DIR,
      claudeDir,
      codexDir: emptyDir,
      cursorDir: emptyDir,
      format: 'json',
    });

    const agents = inventory.passports.filter(p => p.type === 'subagent');
    assert.ok(agents.length >= 1, `Expected at least 1 subagent, got ${agents.length}`);

    const testAgent = agents.find(p => p.id === 'agent-test-agent');
    assert.ok(testAgent, 'Expected to find passport with id "agent-test-agent"');
    assert.equal(testAgent.platform, 'claude-code');
    assert.equal(testAgent.scope, 'user');
    assert.ok(
      testAgent.purpose.length > 0,
      'Expected purpose to be extracted from description frontmatter',
    );
  });

  test('discovers the test skill from the fixture skills dir', async () => {
    const claudeDir = join(FIXTURE_DIR, 'claude');
    const emptyDir = join(FIXTURE_DIR, 'empty');

    const inventory = await scan({
      scanRoot: FIXTURE_DIR,
      claudeDir,
      codexDir: emptyDir,
      cursorDir: emptyDir,
      format: 'json',
    });

    const skills = inventory.passports.filter(p => p.type === 'skill');
    assert.ok(skills.length >= 1, `Expected at least 1 skill, got ${skills.length}`);

    const testSkill = skills.find(p => p.id === 'skill-test-skill');
    assert.ok(testSkill, 'Expected to find passport with id "skill-test-skill"');
    assert.equal(testSkill.invocation, '/test-skill');
    assert.equal(testSkill.platform, 'claude-code');
  });

  test('inventory summary counts match passport array length', async () => {
    const claudeDir = join(FIXTURE_DIR, 'claude');
    const emptyDir = join(FIXTURE_DIR, 'empty');

    const inventory = await scan({
      scanRoot: FIXTURE_DIR,
      claudeDir,
      codexDir: emptyDir,
      cursorDir: emptyDir,
      format: 'json',
    });

    assert.equal(
      inventory.passports.length,
      inventory.summary.total,
      'summary.total should equal passports.length',
    );

    // by_type counts must sum to total
    const typeSum = Object.values(inventory.summary.by_type).reduce((a, b) => a + b, 0);
    assert.equal(typeSum, inventory.summary.total);
  });
});
