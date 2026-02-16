import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { glob } from 'glob';
import type { Platform, ProtoPassport } from '../types.js';
import { toKebab, titleCase } from './utils.js';

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface McpFile {
  mcpServers?: Record<string, McpServerConfig>;
}

function detectPlatform(filePath: string): Platform {
  const segments = filePath.split('/');
  if (segments.includes('.cursor')) return 'cursor';
  if (segments.includes('.windsurf') || segments.includes('.codeium')) return 'windsurf';
  return 'claude-code';
}

async function parseMcpFile(file: string, seen: Set<string>): Promise<ProtoPassport[]> {
  if (seen.has(file)) return [];
  seen.add(file);

  const passports: ProtoPassport[] = [];
  const platform = detectPlatform(file);

  try {
    const raw = await readFile(file, 'utf-8');
    const parsed: McpFile = JSON.parse(raw);

    if (!parsed.mcpServers) return [];

    for (const [serverName, config] of Object.entries(parsed.mcpServers)) {
      const kebab = toKebab(serverName);
      const idPrefix = platform === 'claude-code' ? 'mcp' : `${platform}-mcp`;
      const purpose = config.url
        ? `MCP server: ${config.url}`
        : `MCP server: ${config.command || 'unknown'}`;

      passports.push({
        id: `${idPrefix}-${kebab}`,
        name: titleCase(serverName),
        type: 'mcp',
        platform,
        scope: 'project',
        purpose,
        model_hint: null,
        invocation: null,
        status: 'active',
        tags: [],
        source_file: file.replace(process.env.HOME || '~', '~'),
        metadata: {
          command: config.command || null,
          args: config.args || [],
          env_keys: Object.keys(config.env || {}),
          ...(config.url ? { url: config.url } : {}),
        },
      });
    }
  } catch (err) {
    console.warn(`[ronin] Warning: could not parse MCP file ${file}: ${(err as Error).message}`);
  }

  return passports;
}

export async function parseMcp(scanRoots: string[], extraMcpFiles: string[] = []): Promise<ProtoPassport[]> {
  const seen = new Set<string>();
  const allPassports: ProtoPassport[] = [];

  // Scan for .mcp.json files in project directories (Claude Code convention)
  for (const root of scanRoots) {
    const pattern = join(root, '**/.mcp.json');
    const files = await glob(pattern, {
      maxDepth: 4,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
    });

    for (const file of files) {
      const results = await parseMcpFile(file, seen);
      allPassports.push(...results);
    }
  }

  // Scan extra MCP files (e.g. ~/.cursor/mcp.json)
  for (const file of extraMcpFiles) {
    if (existsSync(file)) {
      const results = await parseMcpFile(file, seen);
      allPassports.push(...results);
    }
  }

  return allPassports.sort((a, b) => a.name.localeCompare(b.name));
}
