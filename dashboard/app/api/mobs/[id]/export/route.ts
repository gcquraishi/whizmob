import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

interface ExportResultShape {
  bundleDir: string;
  fileCount: number;
  secretsStripped: number;
  memoryBootstrapped: number;
  warnings: string[];
  manifest: Record<string, unknown>;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: 'Read-only demo' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const mobId = decodeURIComponent(id);

    // Dynamically import the CLI export module (uses better-sqlite3)
    const whizmobRoot = join(process.cwd(), '..');
    const exportPath = join(whizmobRoot, 'dist', 'export.js');
    const mod = await import(/* webpackIgnore: true */ exportPath);
    const exportFn = mod.exportMob as (name: string, opts?: Record<string, unknown>) => ExportResultShape;

    const result = exportFn(mobId);

    return NextResponse.json({
      bundleDir: result.bundleDir,
      fileCount: result.fileCount,
      secretsStripped: result.secretsStripped,
      memoryBootstrapped: result.memoryBootstrapped,
      warnings: result.warnings,
      manifest: result.manifest,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
