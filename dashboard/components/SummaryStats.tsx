'use client';

import { Bot, Zap, Plug, FolderOpen, Settings } from 'lucide-react';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/platforms';

interface SummaryStatsProps {
  counts: Record<string, number>;
  platformCounts?: Record<string, number>;
}

const typeConfig: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  subagent: { label: 'Agents', icon: Bot, color: 'text-blue-600 bg-blue-50' },
  skill: { label: 'Skills', icon: Zap, color: 'text-amber-600 bg-amber-50' },
  mcp: { label: 'MCP', icon: Plug, color: 'text-purple-600 bg-purple-50' },
  project: { label: 'Projects', icon: FolderOpen, color: 'text-green-600 bg-green-50' },
  settings: { label: 'Settings', icon: Settings, color: 'text-gray-600 bg-gray-100' },
};

export default function SummaryStats({ counts, platformCounts }: SummaryStatsProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hasMultiplePlatforms = platformCounts && Object.keys(platformCounts).length > 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
          <span className="text-lg font-semibold text-gray-900">{total}</span> total
        </div>
        <div className="w-px h-5 bg-gray-200" />
        {Object.entries(typeConfig).map(([type, cfg]) => {
          const count = counts[type] || 0;
          if (count === 0) return null;
          const Icon = cfg.icon;
          return (
            <div
              key={type}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}
            >
              <Icon size={13} />
              <span>{count} {cfg.label}</span>
            </div>
          );
        })}
      </div>
      {hasMultiplePlatforms && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Platforms:</span>
          {Object.entries(platformCounts).map(([platform, count]) => (
            <span
              key={platform}
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PLATFORM_COLORS[platform] || 'text-gray-500 bg-gray-100'}`}
            >
              {PLATFORM_LABELS[platform] || platform} ({count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
