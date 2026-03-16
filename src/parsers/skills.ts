import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import type { Platform, ProtoPassport } from '../types.js';
import { toKebab, titleCase, extractFirstParagraph } from './utils.js';

export async function parseSkills(skillsDir: string, platform: Platform = 'claude-code'): Promise<ProtoPassport[]> {
  const pattern = join(skillsDir, '*/SKILL.md');
  const files = await glob(pattern);
  const passports: ProtoPassport[] = [];
  const idPrefix = platform === 'claude-code' ? 'skill' : `${platform}-skill`;

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf-8');
      const { data: fm, content } = matter(raw);
      const dirName = basename(dirname(file));
      const invocation = `/${dirName}`;

      // Name: from frontmatter or first heading or directory name
      let name = '';
      if (typeof fm.name === 'string') {
        name = titleCase(fm.name);
      } else {
        const headingMatch = content.match(/^#\s+(.+)$/m);
        if (headingMatch) {
          name = headingMatch[1].trim();
        } else {
          name = titleCase(dirName);
        }
      }

      // Purpose: from frontmatter description or first paragraph
      let purpose = '';
      if (typeof fm.description === 'string') {
        purpose = fm.description.split('\n')[0].trim();
      }
      if (!purpose) {
        purpose = extractFirstParagraph(content);
      }

      const kebab = toKebab(dirName);

      passports.push({
        id: `${idPrefix}-${kebab}`,
        name,
        type: 'skill',
        platform,
        scope: 'user',
        purpose,
        model_hint: typeof fm.model === 'string' ? fm.model : null,
        invocation,
        status: 'active',
        tags: [],
        source_file: file.replace(process.env.HOME || '~', '~'),
        mode: typeof fm.mode === 'string' ? fm.mode : null,
        metadata: {},
      });
    } catch (err) {
      console.warn(`[whizmob] Warning: could not parse skill file ${file}: ${(err as Error).message}`);
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}
