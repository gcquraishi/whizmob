import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ProtoPassport } from '../types.js';

// Windsurf (Codeium): ~/.windsurf/ or ~/.codeium/, .windsurfrules files
// Stub — returns [] until Windsurf is installed and conventions are documented
export async function parseWindsurf(): Promise<ProtoPassport[]> {
  const dirs = [
    join(homedir(), '.windsurf'),
    join(homedir(), '.codeium'),
  ];

  const installed = dirs.some(d => existsSync(d));
  if (!installed) return [];

  // TODO: scan .windsurfrules, MCP configs, etc. when format is documented
  return [];
}
