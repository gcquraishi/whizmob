import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import type { ProtoPassport } from '../types.js';
import { toKebab, extractFirstParagraph } from './utils.js';

export async function parseAgents(claudeDir: string): Promise<ProtoPassport[]> {
  const agentsDir = join(claudeDir, 'agents');
  const pattern = join(agentsDir, '*.md');
  const files = await glob(pattern);
  const passports: ProtoPassport[] = [];

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf-8');
      const { data: fm, content } = matter(raw);
      const filename = basename(file, '.md');

      // Skip README files
      if (filename.toLowerCase() === 'readme') continue;

      const name = typeof fm.name === 'string'
        ? fm.name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : filename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const kebab = toKebab(typeof fm.name === 'string' ? fm.name : filename);

      // Extract purpose from description frontmatter or first paragraph
      let purpose = '';
      if (typeof fm.description === 'string') {
        const descLines = fm.description.split('\n');
        purpose = descLines[0].replace(/<[^>]+>/g, '').trim();
      }
      if (!purpose) {
        purpose = extractFirstParagraph(content);
      }

      passports.push({
        id: `agent-${kebab}`,
        name,
        type: 'subagent',
        platform: 'claude-code',
        scope: 'user',
        purpose,
        model_hint: typeof fm.model === 'string' ? fm.model : null,
        invocation: null,
        status: 'active',
        tags: [],
        source_file: file.replace(process.env.HOME || '~', '~'),
        metadata: {
          ...(typeof fm.color === 'string' ? { color: fm.color } : {}),
        },
      });
    } catch (err) {
      console.warn(`[ronin] Warning: could not parse agent file ${file}: ${(err as Error).message}`);
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}
