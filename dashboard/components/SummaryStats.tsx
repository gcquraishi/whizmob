'use client';

import { Bot, Zap, Plug, FolderOpen, Settings, Radar } from 'lucide-react';
import { PLATFORM_LABELS } from '@/lib/platforms';

interface SummaryStatsProps {
  counts: Record<string, number>;
  platformCounts?: Record<string, number>;
  mostRecentProject?: { name: string; date: string } | null;
  lastScan?: { scanned_at: string; total: number } | null;
  dedupGroups?: number;
  dedupPassports?: number;
}

const typeConfig: Record<string, { label: string; singular: string; icon: typeof Bot; color: string; barColor: string }> = {
  subagent: { label: 'Agents', singular: 'Agent', icon: Bot, color: 'text-blue-600', barColor: 'bg-blue-500' },
  skill: { label: 'Skills', singular: 'Skill', icon: Zap, color: 'text-amber-600', barColor: 'bg-amber-500' },
  mcp: { label: 'MCP Servers', singular: 'MCP Server', icon: Plug, color: 'text-purple-600', barColor: 'bg-purple-500' },
  project: { label: 'Projects', singular: 'Project', icon: FolderOpen, color: 'text-green-600', barColor: 'bg-green-500' },
  settings: { label: 'Settings', singular: 'Settings', icon: Settings, color: 'text-gray-500', barColor: 'bg-gray-400' },
};

const platformBarColors: Record<string, string> = {
  'claude-code': 'bg-orange-500',
  cursor: 'bg-sky-500',
  windsurf: 'bg-teal-500',
  copilot: 'bg-indigo-500',
  aider: 'bg-lime-500',
  continue: 'bg-rose-500',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SummaryStats({ counts, platformCounts, mostRecentProject, lastScan, dedupGroups, dedupPassports }: SummaryStatsProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const platformTotal = platformCounts ? Object.values(platformCounts).reduce((a, b) => a + b, 0) : 0;
  const platformCount = platformCounts ? Object.keys(platformCounts).length : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-6">
        {/* Left: headline number + type breakdown */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">{total}</span>
            <span className="text-sm text-gray-500">
              passport{total !== 1 ? 's' : ''}{platformCount > 1 ? ` across ${platformCount} platforms` : ''}
            </span>
          </div>

          {/* Type breakdown as compact pills */}
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(typeConfig).map(([type, cfg]) => {
              const count = counts[type] || 0;
              if (count === 0) return null;
              const Icon = cfg.icon;
              return (
                <div key={type} className={`flex items-center gap-1.5 text-xs ${cfg.color}`}>
                  <Icon size={12} />
                  <span className="font-semibold tabular-nums">{count}</span>
                  <span className="text-gray-400">{count === 1 ? cfg.singular : cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: metadata column */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {lastScan && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Radar size={11} />
              <span>Scanned {relativeTime(lastScan.scanned_at)}</span>
            </div>
          )}
          {dedupGroups != null && dedupGroups > 0 && dedupPassports != null && (
            <div className="text-xs text-amber-500">
              {dedupPassports} duplicates in {dedupGroups} group{dedupGroups !== 1 ? 's' : ''}
            </div>
          )}
          {mostRecentProject && (
            <div className="text-xs text-gray-400">
              Most active: <span className="font-medium text-gray-600">{mostRecentProject.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Platform stacked bar */}
      {platformCounts && platformCount > 1 && (
        <div className="mt-4">
          <div className="flex rounded-full overflow-hidden h-2">
            {Object.entries(platformCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([platform, count]) => (
                <div
                  key={platform}
                  className={`${platformBarColors[platform] || 'bg-gray-400'} transition-all`}
                  style={{ width: `${(count / platformTotal) * 100}%` }}
                  title={`${PLATFORM_LABELS[platform] || platform}: ${count}`}
                />
              ))}
          </div>
          <div className="flex items-center gap-4 mt-2">
            {Object.entries(platformCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([platform, count]) => (
                <div key={platform} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${platformBarColors[platform] || 'bg-gray-400'}`} />
                  <span>{PLATFORM_LABELS[platform] || platform}</span>
                  <span className="text-gray-400 tabular-nums">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
