import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProtoPassport } from '../types.js';

interface ClaudeSettings {
  permissions?: { defaultMode?: string };
  model?: string;
  [key: string]: unknown;
}

export async function parseSettings(claudeDir: string): Promise<ProtoPassport[]> {
  const settingsPath = join(claudeDir, 'settings.json');

  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(raw);

    const model = typeof settings.model === 'string' ? settings.model : null;
    const permMode = settings.permissions?.defaultMode || 'unknown';

    return [{
      id: 'settings-global',
      name: 'Global Settings',
      type: 'settings',
      platform: 'claude-code',
      scope: 'user',
      purpose: `Default model: ${model || 'not set'}, permissions: ${permMode}`,
      model_hint: model,
      invocation: null,
      status: 'active',
      tags: [],
      source_file: settingsPath.replace(process.env.HOME || '~', '~'),
      metadata: {
        default_model: model,
        permissions_mode: permMode,
      },
    }];
  } catch {
    console.warn(`[ronin] Warning: could not read settings at ${settingsPath}`);
    return [];
  }
}
