import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { glob } from 'glob';
import matter from 'gray-matter';
import type { ProtoPassport } from '../types.js';
import { toKebab, extractFirstParagraph } from './utils.js';

/**
 * Parse a single agent .md file into a ProtoPassport.
 */
function parseAgentFile(file: string, raw: string, scope: 'user' | 'project', project?: string): ProtoPassport | null {
  const { data: fm, content } = matter(raw);
  const filename = basename(file, '.md');

  // Skip README files
  if (filename.toLowerCase() === 'readme') return null;

  const name = typeof fm.name === 'string'
    ? fm.name.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : filename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const kebab = toKebab(typeof fm.name === 'string' ? fm.name : filename);

  // Project-scoped agents get a project prefix to avoid ID collisions
  const id = scope === 'project' && project
    ? `agent-${toKebab(project)}-${kebab}`
    : `agent-${kebab}`;

  // Extract purpose from description frontmatter or first paragraph
  let purpose = '';
  if (typeof fm.description === 'string') {
    const descLines = fm.description.split('\n');
    purpose = descLines[0].replace(/<[^>]+>/g, '').trim();
  }
  if (!purpose) {
    purpose = extractFirstParagraph(content);
  }

  return {
    id,
    name,
    type: 'subagent',
    platform: 'claude-code',
    scope,
    purpose,
    model_hint: typeof fm.model === 'string' ? fm.model : null,
    invocation: null,
    status: 'active',
    tags: [],
    source_file: file.replace(process.env.HOME || '~', '~'),
    metadata: {
      ...(typeof fm.color === 'string' ? { color: fm.color } : {}),
      ...(project ? { project } : {}),
    },
  };
}

export async function parseAgents(claudeDir: string, scanRoots?: string[]): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];
  const seen = new Set<string>();

  // 1. User-level agents from ~/.claude/agents/
  const userAgentsDir = join(claudeDir, 'agents');
  const userFiles = await glob(join(userAgentsDir, '*.md'));

  for (const file of userFiles) {
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      const raw = await readFile(file, 'utf-8');
      const passport = parseAgentFile(file, raw, 'user');
      if (passport) passports.push(passport);
    } catch (err) {
      console.warn(`[ronin] Warning: could not parse agent file ${file}: ${(err as Error).message}`);
    }
  }

  // 2. Project-level agents from <scanRoot>/**/.claude/agents/*.md
  if (scanRoots) {
    for (const root of scanRoots) {
      const projectPattern = join(root, '**', '.claude', 'agents', '*.md');
      const projectFiles = await glob(projectPattern, {
        maxDepth: 6,
        ignore: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
      });

      for (const file of projectFiles) {
        if (seen.has(file)) continue;
        seen.add(file);
        try {
          const raw = await readFile(file, 'utf-8');
          // Derive project name from the directory containing .claude/
          const projectDir = dirname(dirname(dirname(file))); // up from agents/ -> .claude/ -> project/
          const project = basename(projectDir);
          const passport = parseAgentFile(file, raw, 'project', project);
          if (passport) passports.push(passport);
        } catch (err) {
          console.warn(`[ronin] Warning: could not parse agent file ${file}: ${(err as Error).message}`);
        }
      }
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}
