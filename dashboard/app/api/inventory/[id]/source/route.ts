import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, basename, resolve } from 'node:path';
import { getPassport } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const passport = await getPassport(decodeURIComponent(id));
    if (!passport) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sourcePath = resolve(passport.source_file.replace(/^~/, homedir()));
    const home = homedir();
    if (!sourcePath.startsWith(home)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const [content, fileStat] = await Promise.all([
      readFile(sourcePath, 'utf-8'),
      stat(sourcePath),
    ]);

    return NextResponse.json({
      content,
      filename: basename(sourcePath),
      extension: extname(sourcePath).slice(1),
      mtime: fileStat.mtime.toISOString(),
    });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Source file not found' }, { status: 404 });
    }
    if (error.code === 'EACCES') {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
