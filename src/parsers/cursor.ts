import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProtoPassport } from '../types.js';
import { parseSkills } from './skills.js';

export async function parseCursor(cursorDir: string): Promise<ProtoPassport[]> {
  const skillsDir = join(cursorDir, 'skills-cursor');
  if (!existsSync(skillsDir)) return [];

  return parseSkills(skillsDir, 'cursor');
}
