import { NextRequest, NextResponse } from 'next/server';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

interface PlanAction {
  file: { bundle_path: string; original_path: string; component_type: string; passport_name: string | null; secrets_stripped: boolean; memory_bootstrapped: boolean };
  targetPath: string;
  conflict: boolean;
  needsSecrets: boolean;
  isBootstrapped: boolean;
}

interface PlanResult {
  manifest: Record<string, unknown>;
  actions: PlanAction[];
  dependencies: Array<{ type: string; name: string; required: boolean; available: boolean }>;
  warnings: string[];
}

interface ImportResultShape {
  installed: number;
  skipped: number;
  conflicts: number;
  provenanceRecorded: number;
  warnings: string[];
}

// POST with { bundlePath, action: 'plan' } → dry-run
// POST with { bundlePath, action: 'execute', force? } → actual import
export async function POST(request: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: 'Read-only demo' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { bundlePath, action, force, params: paramOverrides } = body as {
      bundlePath: string;
      action: 'plan' | 'execute';
      force?: boolean;
      params?: Record<string, string>;
    };

    if (!bundlePath || typeof bundlePath !== 'string') {
      return NextResponse.json({ error: 'bundlePath is required' }, { status: 400 });
    }

    // Restrict bundle paths to ~/.whizmob/exports/ to prevent arbitrary file access
    const safeBundleRoot = join(homedir(), '.whizmob', 'exports');
    const resolvedBundlePath = resolve(bundlePath);
    if (!resolvedBundlePath.startsWith(safeBundleRoot + '/') && resolvedBundlePath !== safeBundleRoot) {
      return NextResponse.json({ error: 'bundlePath must be within ~/.whizmob/exports/' }, { status: 400 });
    }

    if (!existsSync(resolvedBundlePath)) {
      return NextResponse.json({ error: `Bundle not found: ${resolvedBundlePath}` }, { status: 404 });
    }

    // Dynamically import the CLI import module
    const whizmobRoot = join(process.cwd(), '..');
    const importModPath = join(whizmobRoot, 'dist', 'import.js');
    const mod = await import(/* webpackIgnore: true */ importModPath);
    const planImport = mod.planImport as (bundlePath: string, params?: Record<string, string>) => PlanResult;
    const executeImport = mod.executeImport as (bundlePath: string, plan: PlanResult, opts?: { force?: boolean }) => ImportResultShape;

    // Resolve param overrides
    const resolvedParams = paramOverrides || undefined;

    if (action === 'plan') {
      const plan = planImport(bundlePath, resolvedParams);
      return NextResponse.json(plan);
    }

    if (action === 'execute') {
      const plan = planImport(bundlePath, resolvedParams);
      const result = executeImport(bundlePath, plan, { force: !!force });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'action must be "plan" or "execute"' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
