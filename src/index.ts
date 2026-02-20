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
import { importInventory, getStats } from './db.js';
import { translateSkill, printListOutput, printTranslateReport, isValidTarget } from './translate.js';
import type { TargetPlatform } from './adapters/types.js';
import type { OutputFormat } from './types.js';
import { CATEGORY_LABELS } from './types.js';
import type { AgentType } from './types.js';

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
  .command('stats')
  .description('Show inventory summary from the Ronin database')
  .option('-v, --verbose', 'Show per-platform breakdown')
  .action((opts) => {
    try {
      const stats = getStats();
      if (!stats) {
        console.log('No Ronin database found. Run `ronin scan` first.');
        return;
      }

      // Build category breakdown string
      const parts: string[] = [];
      const typeOrder: AgentType[] = ['subagent', 'skill', 'mcp', 'project', 'settings', 'extension'];
      for (const t of typeOrder) {
        const count = stats.byType[t];
        if (count && count > 0) {
          parts.push(`${count} ${CATEGORY_LABELS[t]}`);
        }
      }

      // Last scan relative time
      let lastScanStr = '';
      if (stats.lastScan) {
        const ago = Date.now() - new Date(stats.lastScan.scanned_at).getTime();
        if (ago < 60_000) lastScanStr = 'just now';
        else if (ago < 3_600_000) lastScanStr = `${Math.floor(ago / 60_000)} min ago`;
        else if (ago < 86_400_000) lastScanStr = `${Math.floor(ago / 3_600_000)} hr ago`;
        else lastScanStr = `${Math.floor(ago / 86_400_000)} day(s) ago`;
      }

      console.log(`${stats.total} items across ${stats.platformCount} platform${stats.platformCount !== 1 ? 's' : ''}: ${parts.join(', ')}.${lastScanStr ? ` Last scan: ${lastScanStr}.` : ''}`);

      if (opts.verbose) {
        console.log('');
        const platforms = Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]);
        for (const [platform, count] of platforms) {
          console.log(`  ${platform}: ${count}`);
        }
      }
    } catch (err) {
      console.error(`[ronin] Stats failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('translate [skill]')
  .description('Translate a skill or subagent to other AI platforms')
  .option('--to <targets...>', 'Target platform(s): dalle, midjourney, gemini')
  .option('--list', 'List all translatable skills')
  .option('--dry-run', 'Report only, do not write files')
  .option('-o, --output <dir>', 'Override output directory')
  .action((skill, opts) => {
    try {
      if (opts.list) {
        printListOutput();
        return;
      }

      if (!skill) {
        console.error('[ronin] Provide a skill name or use --list. Example: ronin translate illustrator --to gemini');
        process.exit(1);
      }

      if (!opts.to || opts.to.length === 0) {
        console.error('[ronin] Specify at least one target with --to. Example: --to dalle midjourney gemini');
        process.exit(1);
      }

      // Validate targets
      for (const t of opts.to) {
        if (!isValidTarget(t)) {
          console.error(`[ronin] Unknown target: ${t}. Valid targets: dalle, midjourney, gemini`);
          process.exit(1);
        }
      }

      const result = translateSkill(skill, {
        targets: opts.to as TargetPlatform[],
        outputDir: opts.output,
        dryRun: opts.dryRun,
      });

      printTranslateReport(result, !!opts.dryRun);
    } catch (err) {
      console.error(`[ronin] Translate failed: ${(err as Error).message}`);
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
