#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { scan } from './scanner.js';
import { formatJson } from './formatters/json.js';
import { formatTable } from './formatters/table.js';
import { compactRoster, hookRoster, searchRoster } from './roster.js';
import { importInventory } from './db.js';
import type { OutputFormat } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('ronin')
  .description('Agent inventory and management tool for AI-assisted development')
  .version('0.2.0');

program
  .command('scan')
  .description('Scan development environments and output agent inventory')
  .option('-f, --format <format>', 'Output format: json or table', 'json')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .option('--no-import', 'Skip importing results into the Ronin database')
  .option('--scan-root <path>', 'Root directory to scan for projects', join(homedir(), 'Documents'))
  .option('--claude-dir <path>', 'Claude config directory', join(homedir(), '.claude'))
  .option('--codex-dir <path>', 'Codex config directory', join(homedir(), '.codex'))
  .option('--cursor-dir <path>', 'Cursor config directory', join(homedir(), '.cursor'))
  .action(async (opts) => {
    try {
      const format: OutputFormat = opts.format === 'table' ? 'table' : 'json';

      const inventory = await scan({
        scanRoot: opts.scanRoot,
        claudeDir: opts.claudeDir,
        codexDir: opts.codexDir,
        cursorDir: opts.cursorDir,
        format,
      });

      // Auto-import into Ronin DB unless --no-import
      if (opts.import !== false) {
        const diff = importInventory(inventory);
        console.error(`[ronin] DB updated: ${diff.total} total, +${diff.added} added, -${diff.removed} removed`);
        if (diff.added_names.length > 0) {
          console.error(`[ronin] New: ${diff.added_names.join(', ')}`);
        }
      }

      const output = format === 'table'
        ? formatTable(inventory)
        : formatJson(inventory);

      if (opts.output) {
        await writeFile(opts.output, output, 'utf-8');
        console.log(`Inventory written to ${opts.output}`);
      } else {
        console.log(output);
      }
    } catch (err) {
      console.error(`[ronin] Scan failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('roster')
  .description('Query the agent roster from the Ronin database')
  .option('-s, --search <query>', 'Search agents by name, type, or purpose')
  .option('-t, --type <type>', 'Filter by agent type (subagent, skill, mcp, project, settings)')
  .option('-p, --platform <platform>', 'Filter by platform (claude-code, cursor, codex)')
  .option('--hook', 'Output compact roster for SessionStart hook injection')
  .action((opts) => {
    try {
      if (opts.hook) {
        const output = hookRoster();
        if (output) console.log(output);
      } else if (opts.search) {
        console.log(searchRoster(opts.search));
      } else {
        console.log(compactRoster({ type: opts.type, platform: opts.platform }));
      }
    } catch (err) {
      console.error(`[ronin] Roster failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('dashboard')
  .description('Launch the Ronin web dashboard')
  .option('-p, --port <port>', 'Port to run the dashboard on', '3333')
  .action((opts) => {
    const dashboardDir = join(__dirname, '..', 'dashboard');
    console.log(`Starting Ronin Dashboard on http://localhost:${opts.port}...`);
    try {
      execSync(`npm run dev -- -p ${opts.port}`, {
        cwd: dashboardDir,
        stdio: 'inherit',
      });
    } catch {
      // User killed the process (Ctrl+C)
    }
  });

program.parse();
