/**
 * tests/secrets.test.ts
 *
 * Tests for secret redaction in the export pipeline.
 * Validates that actual secrets are stripped while avoiding false positives
 * on prose/config terms like "key files", "token count", "primary_key".
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stripSecrets } from '../src/export.js';

describe('stripSecrets', () => {
  // ── True positives: should be redacted ────────────────────────────────

  test('redacts JSON-style api_key values', () => {
    const input = '{"api_key": "sk-abc123def456"}';
    const { content, stripped } = stripSecrets(input, 'config.json');
    assert.ok(stripped, 'Should flag as stripped');
    assert.ok(content.includes('REDACTED'), 'Should contain REDACTED');
    assert.ok(!content.includes('sk-abc123def456'), 'Should not contain the secret value');
  });

  test('redacts JSON-style password values', () => {
    const input = '{"database_password": "super-secret-123"}';
    const { content, stripped } = stripSecrets(input, 'config.json');
    assert.ok(stripped);
    assert.ok(!content.includes('super-secret-123'));
  });

  test('redacts JSON-style secret values', () => {
    const input = '{"client_secret": "abcdef123456"}';
    const { content, stripped } = stripSecrets(input, 'config.json');
    assert.ok(stripped);
    assert.ok(!content.includes('abcdef123456'));
  });

  test('redacts JSON-style auth_token values', () => {
    const input = '{"auth_token": "eyJhbGciOiJIUzI1NiJ9"}';
    const { content, stripped } = stripSecrets(input, 'config.json');
    assert.ok(stripped);
    assert.ok(!content.includes('eyJhbGciOiJIUzI1NiJ9'));
  });

  test('redacts JSON-style access_token values', () => {
    const input = '{"access_token": "ya29.a0AfB_byC"}';
    const { content, stripped } = stripSecrets(input, 'config.json');
    assert.ok(stripped);
    assert.ok(!content.includes('ya29.a0AfB_byC'));
  });

  test('redacts YAML-style SECRET_KEY assignments', () => {
    const input = 'SECRET_KEY=my-super-secret-value';
    const { content, stripped } = stripSecrets(input, 'env.txt');
    assert.ok(stripped);
    assert.ok(!content.includes('my-super-secret-value'));
  });

  test('redacts YAML-style API_KEY assignments', () => {
    const input = 'STRIPE_API_KEY: sk_live_abc123';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.ok(stripped);
    assert.ok(!content.includes('sk_live_abc123'));
  });

  test('redacts Stripe-style secret keys (sk- prefix)', () => {
    const input = 'key: sk-abcdefghij1234567890abcd';
    const { content, stripped } = stripSecrets(input, 'notes.md');
    assert.ok(stripped);
    assert.ok(!content.includes('sk-abcdefghij1234567890abcd'));
  });

  test('redacts Stripe-style secret keys (sk_ prefix)', () => {
    const input = 'key: sk_abcdefghij1234567890abcd';
    const { content, stripped } = stripSecrets(input, 'notes.md');
    assert.ok(stripped);
    assert.ok(!content.includes('sk_abcdefghij1234567890abcd'));
  });

  test('redacts GitHub PATs', () => {
    const input = 'Use this token: ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const { content, stripped } = stripSecrets(input, 'notes.md');
    assert.ok(stripped);
    assert.ok(!content.includes('ghp_abcdefghijklmnopqrstuvwxyz0123456789'));
  });

  test('redacts Slack bot tokens', () => {
    const input = 'SLACK_TOKEN: xoxb-123-456-abcdef';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.ok(stripped);
    assert.ok(!content.includes('xoxb-123-456-abcdef'));
  });

  test('redacts env blocks in .mcp.json files', () => {
    const input = '{"mcpServers": {"test": {"env": {"API_KEY": "secret123"}}}}';
    const { content, stripped } = stripSecrets(input, '.mcp.json');
    assert.ok(stripped);
    assert.ok(!content.includes('secret123'));
    assert.ok(content.includes('"REDACTED"'));
  });

  // ── False positives: should NOT be redacted ───────────────────────────

  test('does not redact "primary_key" in prose', () => {
    const input = '{"primary_key": "users.id"}';
    const { content, stripped } = stripSecrets(input, 'schema.json');
    assert.ok(!stripped, 'primary_key should not be treated as a secret');
    assert.ok(content.includes('users.id'), 'Value should be preserved');
  });

  test('does not redact "foreign_key" in config', () => {
    const input = '{"foreign_key": "orders.user_id"}';
    const { content, stripped } = stripSecrets(input, 'schema.json');
    assert.ok(!stripped);
    assert.ok(content.includes('orders.user_id'));
  });

  test('does not redact TOKEN_COUNT values', () => {
    const input = 'TOKEN_COUNT: 4096';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.equal(content, input, 'TOKEN_COUNT should not be modified');
    assert.ok(!stripped);
  });

  test('does not redact TOKEN_EXPIRY values', () => {
    const input = 'TOKEN_EXPIRY: 3600';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.equal(content, input);
    assert.ok(!stripped);
  });

  test('does not redact TOKEN_LIMIT values', () => {
    const input = 'TOKEN_LIMIT: 8192';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.equal(content, input);
    assert.ok(!stripped);
  });

  test('does not redact TOKEN_TYPE values', () => {
    const input = 'TOKEN_TYPE=bearer';
    const { content, stripped } = stripSecrets(input, 'env.txt');
    assert.equal(content, input, 'TOKEN_TYPE should not be modified');
    assert.ok(!stripped);
  });

  test('does not redact TOKEN_EXCHANGE references', () => {
    const input = 'TOKEN_EXCHANGE: some-endpoint';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.equal(content, input, 'TOKEN_EXCHANGE should not be modified');
    assert.ok(!stripped);
  });

  test('does not redact prose about "key files"', () => {
    // "key files" in prose should not trigger redaction
    const input = 'Store key files in the ~/.ssh/ directory.';
    const { content, stripped } = stripSecrets(input, 'README.md');
    assert.equal(content, input, 'Prose about key files should not be modified');
    assert.ok(!stripped);
  });

  test('does not redact "token count" in prose', () => {
    const input = 'The token count for this prompt is approximately 2000.';
    const { content, stripped } = stripSecrets(input, 'README.md');
    assert.equal(content, input, 'Prose about token count should not be modified');
    assert.ok(!stripped);
  });

  test('does not redact numeric-only values in env-style patterns', () => {
    // e.g., TOKEN_TIMEOUT: 30 — number-only values are config, not secrets
    const input = 'AUTH_TOKEN_TIMEOUT: 30';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.equal(content, input, 'Numeric-only values should not be redacted');
    assert.ok(!stripped);
  });

  test('does not redact boolean-like values', () => {
    const input = 'REQUIRE_TOKEN: true';
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.equal(content, input, 'Boolean values should not be redacted');
    assert.ok(!stripped);
  });

  test('preserves non-secret content in mixed files', () => {
    const input = [
      '# Configuration',
      'TOKEN_LIMIT: 4096',
      'API_KEY: real-secret-value',
      'TOKEN_EXPIRY: 3600',
      'description: This key file is important.',
    ].join('\n');
    const { content, stripped } = stripSecrets(input, 'config.yaml');
    assert.ok(stripped, 'File contains at least one real secret');
    assert.ok(!content.includes('real-secret-value'), 'API_KEY value should be redacted');
    assert.ok(content.includes('TOKEN_LIMIT: 4096'), 'TOKEN_LIMIT should be preserved');
    assert.ok(content.includes('TOKEN_EXPIRY: 3600'), 'TOKEN_EXPIRY should be preserved');
    assert.ok(content.includes('This key file is important'), 'Prose should be preserved');
  });
});
