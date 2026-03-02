/**
 * tests/cluster.test.ts
 *
 * Tests for the clusterMobs function from the edges module.
 * This function takes a set of edges and groups passports into
 * connected components (discovered mobs).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { clusterMobs, type InferredEdge } from '../src/edges.js';

function makeEdge(source: string, target: string, type: string = 'references'): InferredEdge {
  return { source_id: source, target_id: target, edge_type: type as any, evidence: `${source}->${target}` };
}

const names = new Map([
  ['a', 'Agent A'],
  ['b', 'Agent B'],
  ['c', 'Agent C'],
  ['d', 'Agent D'],
  ['e', 'Agent E'],
  ['f', 'Agent F'],
]);

describe('clusterMobs', () => {
  test('returns empty array for no edges', () => {
    const mobs = clusterMobs([], names);
    assert.equal(mobs.length, 0);
  });

  test('clusters a connected pair into one mob', () => {
    const edges = [makeEdge('a', 'b')];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs.length, 1);
    assert.equal(mobs[0].members.length, 2);
    assert.ok(mobs[0].members.includes('a'));
    assert.ok(mobs[0].members.includes('b'));
  });

  test('clusters a triangle into one mob', () => {
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'c'),
      makeEdge('a', 'c'),
    ];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs.length, 1);
    assert.equal(mobs[0].members.length, 3);
  });

  test('produces separate mobs for disconnected components', () => {
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('c', 'd'),
    ];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs.length, 2);
  });

  test('excludes singletons (components with only 1 member)', () => {
    // Only a pair: a-b. c has no edges connecting it to another passport.
    const edges = [makeEdge('a', 'b')];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs.length, 1);
    assert.ok(!mobs[0].members.includes('c'));
  });

  test('names the mob after the most-connected node', () => {
    // b is the hub: connected to a, c, and d
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'c'),
      makeEdge('b', 'd'),
    ];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs.length, 1);
    assert.ok(mobs[0].name.includes('Agent B'), `Expected hub name to be Agent B, got: ${mobs[0].name}`);
  });

  test('sorts mobs by size descending', () => {
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('a', 'c'),
      makeEdge('a', 'd'),
      // Smaller cluster
      makeEdge('e', 'f'),
    ];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs.length, 2);
    assert.ok(mobs[0].members.length >= mobs[1].members.length);
  });

  test('filters out project and settings passport types', () => {
    const edges = [
      makeEdge('a', 'b'),  // a is a project, b is a subagent
      makeEdge('b', 'c'),
    ];
    const types = new Map([
      ['a', 'project'],
      ['b', 'subagent'],
      ['c', 'skill'],
    ]);
    const mobs = clusterMobs(edges, names, types);
    // After filtering, only b-c edge remains, so one mob with 2 members
    assert.equal(mobs.length, 1);
    assert.equal(mobs[0].members.length, 2);
    assert.ok(!mobs[0].members.includes('a'), 'Project passport should be excluded');
  });

  test('counts internal edges correctly', () => {
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'c'),
      makeEdge('a', 'c'),
    ];
    const mobs = clusterMobs(edges, names);
    assert.equal(mobs[0].edgeCount, 3);
  });

  test('generates stable IDs from sorted member IDs', () => {
    const edges1 = [makeEdge('b', 'a')];
    const edges2 = [makeEdge('a', 'b')];
    const mobs1 = clusterMobs(edges1, names);
    const mobs2 = clusterMobs(edges2, names);
    assert.equal(mobs1[0].id, mobs2[0].id, 'Same members should produce same ID regardless of edge direction');
  });
});
