import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { toCanonical } from './canonical.js';
import { getAdapter, isValidTarget, listAdapters } from './adapters/registry.js';
import { resolveSkill, recordTranslation, listTranslatableSkills } from './db.js';
import type { TargetPlatform, TargetRuleName, TranslationManifest, SkillMetadata } from './adapters/types.js';
import type { PassportRow } from './db.js';
import Table from 'cli-table3';

function expandPath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

export interface TranslateOptions {
  targets: TargetPlatform[];
  outputDir?: string;
  dryRun?: boolean;
}

export interface TranslateResult {
  skill: PassportRow;
  metadata: SkillMetadata;
  canonical: { markdown: string; rulesApplied: string[]; reviewItems: string[]; isPlatformLocked: boolean };
  targets: Record<string, { markdown: string; rulesApplied: string[]; reviewItems: string[]; fidelity: number }>;
  outputDir: string;
}

export function translateSkill(nameOrId: string, opts: TranslateOptions): TranslateResult {
  // 1. Resolve skill
  const skill = resolveSkill(nameOrId);
  if (!skill) {
    throw new Error(
      `Skill "${nameOrId}" not found. Run \`whizmob translate --list\` to see available skills.`
    );
  }

  // 2. Read source file
  const sourcePath = expandPath(skill.source_file);
  let sourceContent: string;
  try {
    sourceContent = readFileSync(sourcePath, 'utf-8');
  } catch {
    throw new Error(`Cannot read source file: ${sourcePath}`);
  }

  // 3. Build metadata
  const metadata: SkillMetadata = {
    id: skill.id,
    name: skill.name,
    purpose: skill.purpose,
    sourceFile: skill.source_file,
    platform: skill.platform,
  };

  // 4. Stage 1: Source → Canonical
  const canonical = toCanonical(sourceContent, metadata);

  // 5. Stage 2: Canonical → Targets
  const targetResults: Record<string, { markdown: string; rulesApplied: string[]; reviewItems: string[]; fidelity: number }> = {};
  for (const target of opts.targets) {
    const adapter = getAdapter(target);
    const result = adapter.transform(canonical, metadata);
    targetResults[target] = result;
  }

  // 6. Determine output dir
  const slugName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const outputDir = opts.outputDir || join(homedir(), '.whizmob', 'translations', slugName);

  // 7. Write files (unless dry-run)
  if (!opts.dryRun) {
    mkdirSync(outputDir, { recursive: true });

    // Write canonical
    writeFileSync(join(outputDir, 'canonical.md'), canonical.markdown, 'utf-8');

    // Write each target
    for (const [target, result] of Object.entries(targetResults)) {
      writeFileSync(join(outputDir, `${target}.md`), result.markdown, 'utf-8');
    }

    // Build and write manifest
    const manifest: TranslationManifest = {
      source: {
        passportId: skill.id,
        name: skill.name,
        sourceFile: skill.source_file,
        platform: skill.platform,
      },
      canonical: {
        file: join(outputDir, 'canonical.md'),
        rulesApplied: canonical.rulesApplied,
        reviewItems: canonical.reviewItems,
        isPlatformLocked: canonical.isPlatformLocked,
      },
      targets: {} as TranslationManifest['targets'],
      translatedAt: new Date().toISOString(),
    };

    for (const [target, result] of Object.entries(targetResults)) {
      manifest.targets[target as TargetPlatform] = {
        file: join(outputDir, `${target}.md`),
        rulesApplied: result.rulesApplied as TargetRuleName[],
        reviewItems: result.reviewItems,
        fidelity: result.fidelity,
      };
    }

    writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    // 8. Record in DB
    for (const [target, result] of Object.entries(targetResults)) {
      recordTranslation({
        id: randomUUID(),
        sourcePassportId: skill.id,
        targetPlatform: target,
        targetFile: join(outputDir, `${target}.md`),
        canonicalFile: join(outputDir, 'canonical.md'),
        rulesApplied: result.rulesApplied as string[],
        manualReviewItems: result.reviewItems,
        translatedAt: new Date().toISOString(),
      });
    }
  }

  return { skill, metadata, canonical, targets: targetResults, outputDir };
}

export function printListOutput(): void {
  const skills = listTranslatableSkills();
  if (skills.length === 0) {
    console.log('No translatable skills found. Run `whizmob scan` first.');
    return;
  }

  const table = new Table({
    head: ['Name', 'Type', 'Platform', 'Purpose'],
    colWidths: [25, 12, 15, 50],
    wordWrap: true,
  });

  for (const s of skills) {
    const purpose = s.purpose.length > 47 ? s.purpose.slice(0, 44) + '...' : s.purpose;
    table.push([s.name, s.type, s.platform, purpose]);
  }

  console.log(`${skills.length} translatable skill(s) and subagent(s):\n`);
  console.log(table.toString());
  console.log(`\nAvailable targets: ${listAdapters().join(', ')}`);
}

export function printTranslateReport(result: TranslateResult, dryRun: boolean): void {
  const { skill, canonical, targets, outputDir } = result;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Translation: ${skill.name} (${skill.platform})`);
  console.log(`${'='.repeat(60)}`);

  // Canonical summary
  console.log(`\nCanonical:`);
  console.log(`  Rules applied: ${canonical.rulesApplied.join(', ') || 'none'}`);
  if (canonical.isPlatformLocked) {
    console.log(`  ⚠ Platform-locked: high tool dependency detected`);
  }
  if (canonical.reviewItems.length > 0) {
    console.log(`  Review items:`);
    for (const item of canonical.reviewItems) {
      console.log(`    - ${item}`);
    }
  }

  // Target summaries
  for (const [target, result] of Object.entries(targets)) {
    console.log(`\n${target.toUpperCase()} (fidelity: ~${result.fidelity}%):`);
    console.log(`  Rules applied: ${result.rulesApplied.join(', ') || 'none'}`);
    if (result.reviewItems.length > 0) {
      console.log(`  Review items (${result.reviewItems.length}):`);
      for (const item of result.reviewItems) {
        console.log(`    - ${item}`);
      }
    }
  }

  if (dryRun) {
    console.log(`\n[dry-run] Would write to: ${outputDir}/`);
  } else {
    console.log(`\nOutput: ${outputDir}/`);
    console.log(`  canonical.md`);
    for (const target of Object.keys(targets)) {
      console.log(`  ${target}.md`);
    }
    console.log(`  manifest.json`);
  }

  console.log('');
}

export { isValidTarget, listAdapters };
