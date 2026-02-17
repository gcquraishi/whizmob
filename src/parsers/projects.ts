import { readFile, readdir, stat } from 'node:fs/promises';
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

interface SessionStats {
  count: number;
  last_active: string | null;
  total_session_bytes: number;
}

async function countSessions(claudeDir: string): Promise<Map<string, SessionStats>> {
  const projectsDir = join(claudeDir, 'projects');
  const stats = new Map<string, SessionStats>();

  try {
    const dirs = await readdir(projectsDir);
    for (const dir of dirs) {
      try {
        const dirPath = join(projectsDir, dir);
        const entries = await readdir(dirPath);
        const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));

        let latestMtime = 0;
        let totalBytes = 0;

        // Stat all session files to get mtime and size
        const fileStats = await Promise.all(
          jsonlFiles.map(f => stat(join(dirPath, f)).catch(() => null))
        );
        for (const fileStat of fileStats) {
          if (!fileStat) continue;
          totalBytes += fileStat.size;
          if (fileStat.mtimeMs > latestMtime) latestMtime = fileStat.mtimeMs;
        }

        stats.set(dir, {
          count: jsonlFiles.length,
          last_active: latestMtime > 0 ? new Date(latestMtime).toISOString() : null,
          total_session_bytes: totalBytes,
        });
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // projects dir might not exist
  }

  return stats;
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

        // Find matching session stats by encoding the project dir
        // the same way Claude does: /Users/foo/bar -> -Users-foo-bar
        const encoded = projectDir.replace(/\//g, '-');
        let sessionStats: SessionStats = { count: 0, last_active: null, total_session_bytes: 0 };
        for (const [key, stats] of sessionCounts) {
          if (key === encoded || key.startsWith(encoded)) {
            if (stats.count > sessionStats.count) {
              sessionStats = stats;
            }
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
            session_count: sessionStats.count,
            last_active: sessionStats.last_active,
            total_session_bytes: sessionStats.total_session_bytes,
          },
        });
      } catch (err) {
        console.warn(`[ronin] Warning: could not parse project file ${file}: ${(err as Error).message}`);
      }
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}
