import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, basename, resolve } from 'node:path';
import { getPassport } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (process.env.VERCEL) {
      return NextResponse.json({ error: 'Source viewer disabled in demo' }, { status: 403 });
    }

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

    const [rawContent, fileStat] = await Promise.all([
      readFile(sourcePath, 'utf-8'),
      stat(sourcePath),
    ]);

    const filename = basename(sourcePath);
    const extension = extname(sourcePath).slice(1);

    // Redact secrets from config files that may contain env values
    let content = rawContent;
    if (filename === '.mcp.json' || filename === 'settings.json') {
      content = redactSecrets(rawContent);
    }

    return NextResponse.json({
      content,
      filename,
      extension,
      mtime: fileStat.mtime.toISOString(),
    });
  } catch (err: unknown) {
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

const SECRET_PATTERNS = /password|secret|token|key|credential|api.?key/i;

function redactSecrets(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(redactObject(obj), null, 2);
  } catch {
    // Not valid JSON — do regex-based redaction
    return raw.replace(
      /("(?:[^"]*(?:password|secret|token|key|credential)[^"]*)":\s*")([^"]+)(")/gi,
      '$1[REDACTED]$3'
    );
  }
}

function redactObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === 'env' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Redact all values inside "env" blocks (MCP server configs)
      const redacted: Record<string, string> = {};
      for (const envKey of Object.keys(value as Record<string, unknown>)) {
        redacted[envKey] = '[REDACTED]';
      }
      result[key] = redacted;
    } else if (SECRET_PATTERNS.test(key) && typeof value === 'string') {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactObject(value);
    }
  }
  return result;
}
