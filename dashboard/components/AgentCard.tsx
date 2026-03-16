'use client';

import Link from 'next/link';
import { Bot, Zap, Plug, FolderOpen, Settings } from 'lucide-react';
import TagPill from './TagPill';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/platforms';
import { getModeConfig } from '@/lib/modes';

interface AgentCardProps {
  id: string;
  name: string;
  type: string;
  platform: string;
  purpose: string;
  model_hint: string | null;
  tags: string[];
  scope: string;
  mode: string | null;
  showPlatformBadge?: boolean;
}

const typeIcons: Record<string, { icon: typeof Bot; color: string; bg: string }> = {
  subagent: { icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
  skill: { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
  mcp: { icon: Plug, color: 'text-purple-600', bg: 'bg-purple-50' },
  project: { icon: FolderOpen, color: 'text-green-600', bg: 'bg-green-50' },
  settings: { icon: Settings, color: 'text-gray-600', bg: 'bg-gray-100' },
};

export default function AgentCard({ id, name, type, platform, purpose, model_hint, tags, scope, mode, showPlatformBadge }: AgentCardProps) {
  const cfg = typeIcons[type] || typeIcons.subagent;
  const Icon = cfg.icon;
  const modeCfg = getModeConfig(mode);

  return (
    <Link
      href={`/agents/${encodeURIComponent(id)}`}
      className="group block bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:shadow-md transition-all duration-150"
    >
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {name}
            </h3>
            {model_hint && (
              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {model_hint}
              </span>
            )}
            {showPlatformBadge && platform !== 'claude-code' && (
              <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${PLATFORM_COLORS[platform] || 'bg-gray-100 text-gray-500'}`}>
                {PLATFORM_LABELS[platform] || platform}
              </span>
            )}
            {modeCfg && (
              <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${modeCfg.bg} ${modeCfg.text}`}>
                {modeCfg.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {purpose}
          </p>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              {scope}
            </span>
            {tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
