import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ProtoPassport } from '../types.js';

// Aider: ~/.aider.conf.yml, .aider/ directories
// Stub — returns [] until Aider is installed
export async function parseAider(): Promise<ProtoPassport[]> {
  const configFile = join(homedir(), '.aider.conf.yml');
  const configDir = join(homedir(), '.aider');

  const installed = existsSync(configFile) || existsSync(configDir);
  if (!installed) return [];

  // TODO: parse aider config and conventions when format is documented
  return [];
}
