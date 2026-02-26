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
import { importInventory, getStats, resolveSkill } from './db.js';
import {
  defineConstellation,
  addComponents,
  getConstellations,
  getConstellation,
  deleteConstellation,
  removeComponent,
  slugify,
} from './constellation.js';
import { translateSkill, printListOutput, printTranslateReport, isValidTarget } from './translate.js';
import { exportConstellation } from './export.js';
import { planImport, executeImport, loadImportProfile, loadFullProfile, saveImportProfile } from './import.js';
import { createInterface } from 'node:readline/promises';
import { syncConstellation } from './sync.js';
import type { TargetPlatform } from './adapters/types.js';
import { CATEGORY_LABELS, type ComponentType, type OutputFormat, type AgentType } from './types.js';

const VALID_COMPONENT_TYPES: ComponentType[] = ['passport', 'hook', 'memory_schema', 'claude_md', 'config'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('whizmob')
  .description('Inventory, port, and manage your AI agents across Claude Code, Cursor, and Codex')
  .version('0.1.0');

program
  .command('scan')
  .description('Scan development environments and output agent inventory')
  .option('-f, --format <format>', 'Output format: json or table', 'json')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .option('--no-import', 'Skip importing results into the Whizmob database')
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

      // Auto-import into Whizmob DB unless --no-import
      if (opts.import !== false) {
        const diff = importInventory(inventory);
        console.error(`[whizmob] DB updated: ${diff.total} total, +${diff.added} added, -${diff.removed} removed`);
        if (diff.added_names.length > 0) {
          console.error(`[whizmob] New: ${diff.added_names.join(', ')}`);
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
      console.error(`[whizmob] Scan failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('roster')
  .description('Query the agent roster from the Whizmob database')
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
      console.error(`[whizmob] Roster failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show inventory summary from the Whizmob database')
  .option('-v, --verbose', 'Show per-platform breakdown')
  .action((opts) => {
    try {
      const stats = getStats();
      if (!stats) {
        console.log('No database found. Run `whizmob scan` first.');
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

      if (stats.constellationCount > 0) {
        console.log(`${stats.constellationCount} constellation${stats.constellationCount !== 1 ? 's' : ''} (${stats.constellationComponentCount} components)`);
      }

      if (opts.verbose) {
        console.log('');
        const platforms = Object.entries(stats.byPlatform).sort((a, b) => b[1] - a[1]);
        for (const [platform, count] of platforms) {
          console.log(`  ${platform}: ${count}`);
        }
      }
    } catch (err) {
      console.error(`[whizmob] Stats failed: ${(err as Error).message}`);
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
        console.error('[whizmob] Provide a skill name or use --list. Example: whizmob translate illustrator --to gemini');
        process.exit(1);
      }

      if (!opts.to || opts.to.length === 0) {
        console.error('[whizmob] Specify at least one target with --to. Example: --to dalle midjourney gemini');
        process.exit(1);
      }

      // Validate targets
      for (const t of opts.to) {
        if (!isValidTarget(t)) {
          console.error(`[whizmob] Unknown target: ${t}. Valid targets: dalle, midjourney, gemini`);
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
      console.error(`[whizmob] Translate failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('dashboard')
  .description('Launch the Whizmob web dashboard')
  .option('-p, --port <port>', 'Port to run the dashboard on', '3333')
  .action((opts) => {
    const dashboardDir = join(__dirname, '..', 'dashboard');
    console.log(`Starting Whizmob Dashboard on http://localhost:${opts.port}...`);
    try {
      execSync(`npm run dev -- -p ${opts.port}`, {
        cwd: dashboardDir,
        stdio: 'inherit',
      });
    } catch {
      // User killed the process (Ctrl+C)
    }
  });

const constellation = program
  .command('constellation')
  .description('Manage constellations — groups of agents that work together');

constellation
  .command('define <name>')
  .description('Define a new constellation')
  .option('--desc <description>', 'Description of the constellation', '')
  .option('--author <author>', 'Author name')
  .option('--add <passports...>', 'Passport names to add as initial components')
  .action((name: string, opts) => {
    try {
      const id = defineConstellation(name, opts.desc, opts.author);
      console.log(`Created constellation: ${id}`);

      if (opts.add && opts.add.length > 0) {
        const components = [];
        const notFound: string[] = [];

        for (const passportName of opts.add) {
          const passport = resolveSkill(passportName);
          if (passport) {
            components.push({
              passport_id: passport.id,
              component_type: 'passport' as ComponentType,
              role: passport.type === 'skill' ? 'skill' : undefined,
            });
          } else {
            notFound.push(passportName);
          }
        }

        if (components.length > 0) {
          const added = addComponents(id, components);
          console.log(`Added ${added} component${added !== 1 ? 's' : ''}.`);
        }

        if (notFound.length > 0) {
          console.error(`[whizmob] Not found in DB: ${notFound.join(', ')}`);
        }
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

constellation
  .command('list')
  .description('List all constellations')
  .action(() => {
    try {
      const items = getConstellations();
      if (items.length === 0) {
        console.log('No constellations defined. Use `whizmob constellation define <name>` to create one.');
        return;
      }
      for (const c of items) {
        const parts = [c.name];
        if (c.description) parts.push(`— ${c.description}`);
        parts.push(`(${c.component_count} component${c.component_count !== 1 ? 's' : ''})`);
        console.log(parts.join(' '));
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

constellation
  .command('show <name>')
  .description('Show constellation details')
  .action((name: string) => {
    try {
      const id = slugify(name);
      const detail = getConstellation(id);
      if (!detail) {
        console.error(`[whizmob] Constellation "${name}" not found.`);
        process.exit(1);
      }

      console.log(`${detail.name} (${detail.id})`);
      if (detail.description) console.log(`  ${detail.description}`);
      if (detail.author) console.log(`  Author: ${detail.author}`);
      console.log(`  Created: ${detail.created_at}`);
      console.log(`  Updated: ${detail.updated_at}`);
      console.log(`  Components (${detail.components.length}):`);

      for (const comp of detail.components) {
        const label = comp.passport_name || comp.file_path || comp.passport_id || '(unknown)';
        const typeBadge = comp.component_type !== 'passport' ? ` [${comp.component_type}]` : '';
        const roleBadge = comp.role ? ` (${comp.role})` : '';
        console.log(`    - ${label}${typeBadge}${roleBadge}`);
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

constellation
  .command('add-component <constellation> <passport-or-path>')
  .description('Add a component to a constellation')
  .option('--type <type>', 'Component type: passport, hook, memory_schema, claude_md, config', 'passport')
  .option('--role <role>', 'Role label for display')
  .action((constellationName: string, passportOrPath: string, opts) => {
    try {
      const constellationId = slugify(constellationName);
      if (!VALID_COMPONENT_TYPES.includes(opts.type)) {
        console.error(`[whizmob] Invalid type: ${opts.type}. Valid: ${VALID_COMPONENT_TYPES.join(', ')}`);
        process.exit(1);
      }
      const componentType = opts.type as ComponentType;

      if (componentType === 'passport') {
        const passport = resolveSkill(passportOrPath);
        if (!passport) {
          console.error(`[whizmob] Passport "${passportOrPath}" not found in DB.`);
          process.exit(1);
        }
        const added = addComponents(constellationId, [{
          passport_id: passport.id,
          component_type: 'passport',
          role: opts.role,
        }]);
        if (added > 0) {
          console.log(`Added ${passport.name} to ${constellationName}.`);
        } else {
          console.log(`${passport.name} is already in ${constellationName}.`);
        }
      } else {
        const added = addComponents(constellationId, [{
          file_path: passportOrPath,
          component_type: componentType,
          role: opts.role,
        }]);
        if (added > 0) {
          console.log(`Added ${passportOrPath} [${componentType}] to ${constellationName}.`);
        } else {
          console.log(`${passportOrPath} is already in ${constellationName}.`);
        }
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

constellation
  .command('remove-component <constellation> <passport-or-path>')
  .description('Remove a component from a constellation')
  .action((constellationName: string, passportOrPath: string) => {
    try {
      const constellationId = slugify(constellationName);
      const removed = removeComponent(constellationId, passportOrPath);
      if (removed) {
        console.log(`Removed ${passportOrPath} from ${constellationName}.`);
      } else {
        console.error(`[whizmob] Component "${passportOrPath}" not found in constellation "${constellationName}".`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

constellation
  .command('sync <bundle>')
  .description('Detect changes between source files and an export bundle (read-only)')
  .action((bundlePath: string) => {
    try {
      const result = syncConstellation(bundlePath);

      console.log(`Constellation: ${result.constellation}`);
      console.log(`Exported: ${result.exportedAt} from ${result.exportedFrom}`);
      console.log(`Status: ${result.unchanged} unchanged, ${result.modified} modified, ${result.missingSrc} missing source, ${result.missingBundle} missing bundle`);
      console.log('');

      for (const entry of result.entries) {
        const label = entry.passportName || entry.originalPath;
        const statusIcon = {
          unchanged: ' ',
          modified: 'M',
          missing_source: '!',
          missing_bundle: '?',
        }[entry.status];

        console.log(`  ${statusIcon} ${label}`);
        if (entry.diff) {
          for (const line of entry.diff.split('\n')) {
            console.log(`    ${line}`);
          }
        }
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

constellation
  .command('delete <name>')
  .description('Delete a constellation and all its component links')
  .action((name: string) => {
    try {
      const id = slugify(name);
      const deleted = deleteConstellation(id);
      if (deleted) {
        console.log(`Deleted constellation: ${name}`);
      } else {
        console.error(`[whizmob] Constellation "${name}" not found.`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('export <constellation>')
  .description('Export a constellation as a portable bundle')
  .option('-o, --output <dir>', 'Output directory (default: ~/.whizmob/exports/<id>)')
  .option('--dry-run', 'Show what would be exported without writing files')
  .action((constellationName: string, opts) => {
    try {
      const result = exportConstellation(constellationName, {
        outputDir: opts.output,
        dryRun: opts.dryRun,
      });

      if (opts.dryRun) {
        console.log(`[dry-run] Would export constellation "${result.manifest.constellation.name}":`);
      } else {
        console.log(`Exported "${result.manifest.constellation.name}" to ${result.bundleDir}`);
      }

      console.log(`  Version: ${result.manifest.bundle_version}`);
      console.log(`  Files: ${result.fileCount}`);
      if (result.secretsStripped > 0) {
        console.log(`  Secrets stripped: ${result.secretsStripped} file(s)`);
      }
      if (result.memoryBootstrapped > 0) {
        console.log(`  Memory bootstrapped: ${result.memoryBootstrapped} file(s) (structure only)`);
      }
      if (result.contentParamsDetected > 0) {
        console.log(`  Content parameters: ${result.contentParamsDetected}`);
        for (const [token, meta] of Object.entries(result.manifest.content_parameters)) {
          const req = meta.required ? 'required' : 'optional';
          const def = meta.default_value ? ` (default: ${meta.default_value})` : '';
          console.log(`    ${token} — ${meta.description} [${req}]${def}`);
        }
      }
      if (result.manifest.dependencies.length > 0) {
        console.log(`  Dependencies: ${result.manifest.dependencies.map(d => d.name).join(', ')}`);
      }

      for (const entry of result.manifest.files) {
        const flags: string[] = [];
        if (entry.secrets_stripped) flags.push('secrets-stripped');
        if (entry.memory_bootstrapped) flags.push('bootstrapped');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        console.log(`    ${entry.original_path} → ${entry.bundle_path}${flagStr}`);
      }

      if (result.manifest.changelog.length > 0) {
        console.log('');
        console.log('  Changelog:');
        for (const entry of result.manifest.changelog) {
          console.log(`    v${entry.version} (${entry.date.split('T')[0]}): ${entry.summary}`);
          for (const f of entry.files_changed) {
            console.log(`      - ${f}`);
          }
        }
      }

      if (result.warnings.length > 0) {
        console.log('');
        for (const w of result.warnings) {
          console.log(`  ⚠ ${w}`);
        }
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('import <bundle>')
  .description('Import a constellation bundle into the local environment')
  .option('--dry-run', 'Show what would be installed without writing files')
  .option('--force', 'Overwrite existing files without prompting')
  .option('--no-profile', 'Ignore saved import profile')
  .option('--no-prompt', 'Skip interactive prompts (fail on missing params)')
  .option('--param <params...>', 'Override parameters as KEY=VALUE (e.g. --param "{{HOME}}=/Users/me")')
  .action(async (bundlePath: string, opts) => {
    try {
      // Parse custom parameters from --param flags
      const cliParams: Record<string, string> = {};
      if (opts.param) {
        for (const p of opts.param) {
          const eqIdx = p.indexOf('=');
          if (eqIdx < 0) {
            console.error(`[whizmob] Invalid parameter: ${p}. Use KEY=VALUE format.`);
            process.exit(1);
          }
          cliParams[p.slice(0, eqIdx)] = p.slice(eqIdx + 1);
        }
      }

      // Initial plan to discover constellation ID and content params
      const initialPlan = planImport(bundlePath, Object.keys(cliParams).length > 0 ? cliParams : undefined);
      const constellationId = initialPlan.manifest.constellation.id;

      // Resolution order: CLI --param > saved profile > interactive prompt > default
      const fullProfile = opts.profile !== false ? loadFullProfile(constellationId) : { params: {}, last_imported_version: null };
      const profileParams = fullProfile.params;
      const mergedParams = { ...profileParams, ...cliParams };

      // Re-plan with merged params
      let plan = planImport(bundlePath, Object.keys(mergedParams).length > 0 ? mergedParams : undefined);

      // Interactive prompting for unresolved required params
      const unresolvedRequired = plan.contentParams.filter(cp => !cp.resolved && cp.meta.required);
      if (unresolvedRequired.length > 0 && opts.prompt !== false && !opts.dryRun) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        console.log('');
        console.log('Content parameters needed:');
        try {
          for (const cp of unresolvedRequired) {
            const defaultHint = cp.meta.default_value ? ` [${cp.meta.default_value}]` : '';
            const answer = await rl.question(`  ${cp.meta.description} (${cp.token})${defaultHint}: `);
            const value = answer.trim() || cp.meta.default_value;
            if (value) {
              mergedParams[cp.token] = value;
            }
          }
        } finally {
          rl.close();
        }
        // Re-plan with prompted values
        plan = planImport(bundlePath, mergedParams);
      }

      console.log('');
      console.log(`Constellation: ${plan.manifest.constellation.name}`);
      console.log(`Exported from: ${plan.manifest.exported_from} at ${plan.manifest.exported_at}`);
      console.log(`Files: ${plan.actions.length}`);
      console.log('');

      // Show plan
      for (const action of plan.actions) {
        const flags: string[] = [];
        if (action.conflict) flags.push('EXISTS');
        if (action.needsSecrets) flags.push('needs-secrets');
        if (action.isBootstrapped) flags.push('bootstrapped');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        console.log(`  ${action.file.bundle_path} → ${action.targetPath}${flagStr}`);
      }

      // Show content parameters
      if (plan.contentParams.length > 0) {
        console.log('');
        console.log('Content parameters:');
        for (const cp of plan.contentParams) {
          const status = cp.resolved ? cp.value : (cp.meta.required ? 'MISSING' : `optional${cp.meta.default_value ? ` (default: ${cp.meta.default_value})` : ''}`);
          console.log(`  ${cp.token} — ${cp.meta.description}: ${status}`);
        }
      }

      // Show dependencies
      if (plan.dependencies.length > 0) {
        console.log('');
        console.log('Dependencies:');
        for (const dep of plan.dependencies) {
          const status = dep.available ? 'OK' : (dep.required ? 'MISSING' : 'optional');
          console.log(`  ${dep.type}: ${dep.name} — ${status}`);
        }
      }

      // Show changelog (entries since last import)
      const changelog = plan.manifest.changelog || [];
      const newEntries = fullProfile.last_imported_version
        ? changelog.filter(e => e.version > fullProfile.last_imported_version!)
        : changelog;
      if (newEntries.length > 0) {
        console.log('');
        console.log(fullProfile.last_imported_version
          ? `Changes since your last import (v${fullProfile.last_imported_version}):`
          : 'Changelog:');
        for (const entry of newEntries) {
          console.log(`  v${entry.version} (${entry.date.split('T')[0]}): ${entry.summary}`);
          for (const f of entry.files_changed) {
            console.log(`    - ${f}`);
          }
        }
      }

      // Show warnings
      if (plan.warnings.length > 0) {
        console.log('');
        for (const w of plan.warnings) {
          console.log(`  Warning: ${w}`);
        }
      }

      if (opts.dryRun) {
        console.log('\n[dry-run] No files written.');
        return;
      }

      console.log('');
      const result = executeImport(bundlePath, plan, { force: opts.force });

      console.log(`Installed: ${result.installed} file(s)`);
      if (result.contentParamsApplied > 0) {
        console.log(`Content parameters applied: ${result.contentParamsApplied} substitution(s)`);
      }
      if (result.provenanceRecorded > 0) {
        console.log(`Provenance recorded: ${result.provenanceRecorded} passport(s)`);
      }
      if (result.conflicts > 0 && !opts.force) {
        console.log(`Skipped: ${result.conflicts} existing file(s) (use --force to overwrite)`);
      }
      if (result.skipped > 0 && result.skipped !== result.conflicts) {
        console.log(`Skipped: ${result.skipped - result.conflicts} file(s) (missing from bundle)`);
      }

      // Save profile for future re-imports
      if (result.installed > 0) {
        const contentParamValues: Record<string, string> = {};
        for (const cp of plan.contentParams) {
          if (cp.value !== null) {
            contentParamValues[cp.token] = cp.value;
          }
        }
        if (Object.keys(contentParamValues).length > 0) {
          saveImportProfile(constellationId, contentParamValues, plan.manifest.bundle_version);
          console.log(`Profile saved to ~/.whizmob/import-profiles/${constellationId}.json (v${plan.manifest.bundle_version})`);
        }
      }
    } catch (err) {
      console.error(`[whizmob] ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
