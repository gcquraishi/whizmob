import type { AgentType, ProtoPassport, RoninInventory, ScanOptions } from './types.js';
import { parseAgents } from './parsers/agents.js';
import { parseSkills } from './parsers/skills.js';
import { parseMcp } from './parsers/mcp.js';
import { parseProjects } from './parsers/projects.js';
import { parseSettings } from './parsers/settings.js';
import { parseCodex } from './parsers/codex.js';
import { parseCursor } from './parsers/cursor.js';
import { parseWindsurf } from './parsers/windsurf.js';
import { parseCopilot } from './parsers/copilot.js';
import { parseAider } from './parsers/aider.js';
import { join } from 'node:path';

export async function scan(options: ScanOptions): Promise<RoninInventory> {
  const start = Date.now();
  const { scanRoot, claudeDir, codexDir, cursorDir } = options;
  const scanRoots = [scanRoot];

  // Extra MCP files from non-Claude platforms
  const extraMcpFiles = [
    join(cursorDir, 'mcp.json'),
  ];

  // Run all parsers in parallel
  const [agents, skills, mcp, projects, settings, codexSkills, cursorSkills, windsurf, copilot, aider] = await Promise.all([
    parseAgents(claudeDir),
    parseSkills(join(claudeDir, 'skills')),
    parseMcp(scanRoots, extraMcpFiles),
    parseProjects(scanRoots, claudeDir),
    parseSettings(claudeDir),
    parseCodex(codexDir),
    parseCursor(cursorDir),
    parseWindsurf(),
    parseCopilot(scanRoot),
    parseAider(),
  ]);

  const passports: ProtoPassport[] = [
    ...agents, ...skills, ...mcp, ...projects, ...settings,
    ...codexSkills, ...cursorSkills, ...windsurf, ...copilot, ...aider,
  ];

  // Build by_type summary
  const byType: Record<AgentType, number> = {
    subagent: 0,
    skill: 0,
    mcp: 0,
    project: 0,
    settings: 0,
    extension: 0,
  };
  for (const p of passports) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }

  // Build by_platform summary
  const byPlatform: Record<string, number> = {};
  for (const p of passports) {
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
  }

  return {
    version: '0.2.0',
    scanned_at: new Date().toISOString(),
    scan_duration_ms: Date.now() - start,
    platform: 'multi',
    summary: {
      total: passports.length,
      by_type: byType,
      by_platform: byPlatform,
      projects_scanned: projects.length,
      mcp_servers: passports.filter(p => p.type === 'mcp').length,
    },
    passports,
  };
}
