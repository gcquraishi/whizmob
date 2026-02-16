import Table from 'cli-table3';
import type { RoninInventory } from '../types.js';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const TYPE_LABELS: Record<string, string> = {
  subagent: 'Agent',
  skill: 'Skill',
  mcp: 'MCP',
  project: 'Project',
  settings: 'Settings',
  extension: 'Extension',
};

export function formatTable(inventory: RoninInventory): string {
  const lines: string[] = [];

  // Summary header
  lines.push(`\nRonin Agent Inventory v${inventory.version}`);
  lines.push(`Scanned at: ${inventory.scanned_at}`);
  lines.push(`Duration: ${inventory.scan_duration_ms}ms`);
  lines.push(`Total: ${inventory.summary.total} items\n`);

  const hasMultiplePlatforms = Object.keys(inventory.summary.by_platform || {}).length > 1;

  const table = new Table({
    head: hasMultiplePlatforms
      ? ['Name', 'Type', 'Platform', 'Model', 'Scope', 'Purpose']
      : ['Name', 'Type', 'Model', 'Scope', 'Purpose'],
    colWidths: hasMultiplePlatforms
      ? [24, 10, 12, 8, 9, 40]
      : [28, 10, 8, 9, 50],
    wordWrap: true,
    style: { head: ['cyan'] },
  });

  for (const p of inventory.passports) {
    const row = hasMultiplePlatforms
      ? [p.name, TYPE_LABELS[p.type] || p.type, p.platform, p.model_hint || '-', p.scope, truncate(p.purpose, 38)]
      : [p.name, TYPE_LABELS[p.type] || p.type, p.model_hint || '-', p.scope, truncate(p.purpose, 48)];
    table.push(row);
  }

  lines.push(table.toString());

  // Type breakdown
  lines.push('\nBy Type:');
  for (const [type, count] of Object.entries(inventory.summary.by_type)) {
    if (count > 0) {
      lines.push(`  ${TYPE_LABELS[type] || type}: ${count}`);
    }
  }

  // Platform breakdown
  if (hasMultiplePlatforms) {
    lines.push('\nBy Platform:');
    for (const [platform, count] of Object.entries(inventory.summary.by_platform)) {
      lines.push(`  ${platform}: ${count}`);
    }
  }

  return lines.join('\n');
}
