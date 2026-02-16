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
  .option('--scan-root <path>', 'Root directory to scan for projects', join(homedir(), 'Documents'))
  .option('--claude-dir <path>', 'Claude config directory', join(homedir(), '.claude'))
  .option('--cursor-dir <path>', 'Cursor config directory', join(homedir(), '.cursor'))
  .action(async (opts) => {
    try {
      const format: OutputFormat = opts.format === 'table' ? 'table' : 'json';

      const inventory = await scan({
        scanRoot: opts.scanRoot,
        claudeDir: opts.claudeDir,
        cursorDir: opts.cursorDir,
        format,
      });

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
