import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { glob } from 'glob';
import type { ProtoPassport } from '../types.js';

function toKebab(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

function extractHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractFirstParagraph(content: string): string {
  const lines = content.split('\n');
  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('**') && !trimmed.startsWith('---')) {
        started = true;
        paragraphLines.push(trimmed);
      }
      continue;
    }
    if (!trimmed || trimmed.startsWith('#')) break;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').slice(0, 300);
}

async function countSessions(claudeDir: string): Promise<Map<string, number>> {
  const projectsDir = join(claudeDir, 'projects');
  const counts = new Map<string, number>();

  try {
    const dirs = await readdir(projectsDir);
    for (const dir of dirs) {
      try {
        const entries = await readdir(join(projectsDir, dir));
        const sessions = entries.filter(e => e.endsWith('.jsonl')).length;
        // Store the raw dir name (e.g. "-Users-gcquraishi-Documents-big-heavy-fictotum")
        counts.set(dir, sessions);
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // projects dir might not exist
  }

  return counts;
}

export async function parseProjects(scanRoots: string[], claudeDir: string): Promise<ProtoPassport[]> {
  const passports: ProtoPassport[] = [];
  const seen = new Set<string>();
  const sessionCounts = await countSessions(claudeDir);

  for (const root of scanRoots) {
    const pattern = join(root, '**/CLAUDE.md');
    const files = await glob(pattern, {
      maxDepth: 4,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
    });

    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);

      try {
        const raw = await readFile(file, 'utf-8');
        const projectDir = join(file, '..');
        const dirName = basename(projectDir);
        const heading = extractHeading(raw);
        const name = heading || dirName;
        const purpose = extractFirstParagraph(raw);
        const kebab = toKebab(dirName);

        // Find matching session count by encoding the project dir
        // the same way Claude does: /Users/foo/bar -> -Users-foo-bar
        const encoded = projectDir.replace(/\//g, '-');
        let sessions = 0;
        for (const [key, count] of sessionCounts) {
          if (key === encoded || key.startsWith(encoded)) {
            sessions = Math.max(sessions, count);
          }
        }

        passports.push({
          id: `project-${kebab}`,
          name,
          type: 'project',
          platform: 'claude-code',
          scope: 'project',
          purpose,
          model_hint: null,
          invocation: null,
          status: 'active',
          tags: [],
          source_file: file.replace(process.env.HOME || '~', '~'),
          metadata: {
            directory: projectDir.replace(process.env.HOME || '~', '~'),
            session_count: sessions,
          },
        });
      } catch (err) {
        console.warn(`[ronin] Warning: could not parse project file ${file}: ${(err as Error).message}`);
      }
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}
