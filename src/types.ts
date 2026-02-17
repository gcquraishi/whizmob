export type Platform = 'claude-code' | 'codex' | 'cursor' | 'windsurf' | 'copilot' | 'aider' | 'continue';
export type AgentType = 'subagent' | 'skill' | 'mcp' | 'project' | 'settings' | 'extension';
export type AgentScope = 'user' | 'project';
export type AgentStatus = 'active' | 'draft' | 'archived';
export type OutputFormat = 'json' | 'table';

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
  metadata: Record<string, unknown>;
}

export interface RoninInventory {
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
