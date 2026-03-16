export type Platform = 'claude-code' | 'codex' | 'cursor' | 'windsurf' | 'copilot' | 'aider' | 'continue';
export type AgentType = 'subagent' | 'skill' | 'mcp' | 'project' | 'settings' | 'extension';
export type AgentScope = 'user' | 'project';
export type AgentStatus = 'active' | 'draft' | 'archived';
export type ComponentType = 'passport' | 'hook' | 'memory_schema' | 'claude_md' | 'config' | 'documentation';
export type LicenseType = 'personal' | 'work' | 'open' | 'commercial';
export type OutputFormat = 'json' | 'table';

/** Canonical display labels for each AgentType. Use these in all user-facing output. */
export const CATEGORY_LABELS: Record<AgentType, string> = {
  subagent: 'agents',
  skill: 'skills',
  mcp: 'mcp servers',
  project: 'project configs',
  settings: 'settings',
  extension: 'extensions',
};

export interface ProtoPassport {
  id: string;
  name: string;
  type: AgentType;
  platform: Platform;
  scope: AgentScope;
  purpose: string;
  model_hint?: string | null;
  invocation?: string | null;
  status: AgentStatus;
  tags: string[];
  source_file: string;
  origin?: string | null;
  author?: string | null;
  license?: LicenseType | null;
  forked_from?: string | null;
  mode?: string | null;
  metadata: Record<string, unknown>;
}

export interface WhizmobInventory {
  version: string;
  scanned_at: string;
  scan_duration_ms: number;
  platform: 'multi';
  summary: {
    total: number;
    by_type: Record<AgentType, number>;
    by_platform: Record<string, number>;
    projects_scanned: number;
    mcp_servers: number;
  };
  passports: ProtoPassport[];
}

export interface ScanOptions {
  scanRoot: string;
  claudeDir: string;
  codexDir: string;
  cursorDir: string;
  format: OutputFormat;
  output?: string;
}
