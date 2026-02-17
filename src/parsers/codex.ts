import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProtoPassport } from '../types.js';
import { parseSkills } from './skills.js';

export async function parseCodex(codexDir: string): Promise<ProtoPassport[]> {
  const skillsDir = join(codexDir, 'skills');
  if (!existsSync(skillsDir)) return [];

  return parseSkills(skillsDir, 'codex');
}
