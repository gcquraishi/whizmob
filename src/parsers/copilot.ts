import { basename, dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import type { ProtoPassport } from '../types.js';
import { toKebab, extractFirstParagraph } from './utils.js';

// GitHub Copilot: .github/copilot-instructions.md in project directories
export async function parseCopilot(scanRoot: string): Promise<ProtoPassport[]> {
  const pattern = join(scanRoot, '**/.github/copilot-instructions.md');
  const files = await glob(pattern, {
    maxDepth: 4,
    ignore: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
  });

  const passports: ProtoPassport[] = [];

  for (const file of files) {
    try {
      const raw = await readFile(file, 'utf-8');
      // Derive project name from the directory above .github/
      const projectName = basename(dirname(dirname(file))) || 'unknown';
      const kebab = toKebab(projectName);

      passports.push({
        id: `copilot-instructions-${kebab}`,
        name: `${projectName} (Copilot)`,
        type: 'project',
        platform: 'copilot',
        scope: 'project',
        purpose: extractFirstParagraph(raw) || 'Copilot project instructions',
        model_hint: null,
        invocation: null,
        status: 'active',
        tags: [],
        source_file: file.replace(process.env.HOME || '~', '~'),
        metadata: {},
      });
    } catch (err) {
      console.warn(`[ronin] Warning: could not parse Copilot file ${file}: ${(err as Error).message}`);
    }
  }

  return passports.sort((a, b) => a.name.localeCompare(b.name));
}
