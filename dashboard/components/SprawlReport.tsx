'use client';

import Link from 'next/link';
import { Bot, Zap, Plug, FolderOpen, Settings, Copy, Fingerprint } from 'lucide-react';
import { PLATFORM_LABELS, PLATFORM_COLORS } from '@/lib/platforms';
import type { DedupGroup, DedupResult } from '@/lib/dedup';

const typeIcons: Record<string, { icon: typeof Bot; color: string; bg: string }> = {
  subagent: { icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
  skill: { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
  mcp: { icon: Plug, color: 'text-purple-600', bg: 'bg-purple-50' },
  project: { icon: FolderOpen, color: 'text-green-600', bg: 'bg-green-50' },
  settings: { icon: Settings, color: 'text-gray-600', bg: 'bg-gray-100' },
};

const FIELD_LABELS: Record<string, string> = {
  platform: 'Platform',
  scope: 'Scope',
  purpose: 'Purpose',
  model_hint: 'Model',
  type: 'Type',
};

function ReasonBadge({ reason }: { reason: DedupGroup['reason'] }) {
  if (reason === 'exact-name') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
        <Copy size={10} />
        Exact Name
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
      <Fingerprint size={10} />
      Core Slug
    </span>
  );
}

function GroupCard({ group }: { group: DedupGroup }) {
  const firstMember = group.members[0];
  const cfg = typeIcons[firstMember.type] || typeIcons.subagent;
  const Icon = cfg.icon;

  // Fields that are the same across all members (shown once)
  const sharedFields: { label: string; value: string }[] = [];
  if (!group.differingFields.includes('type')) {
    sharedFields.push({ label: 'Type', value: firstMember.type });
  }
  if (!group.differingFields.includes('purpose') && firstMember.purpose) {
    sharedFields.push({ label: 'Purpose', value: firstMember.purpose });
  }
  if (!group.differingFields.includes('model_hint') && firstMember.model_hint) {
    sharedFields.push({ label: 'Model', value: firstMember.model_hint });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${cfg.bg} ${cfg.color} flex items-center justify-center`}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {group.canonicalName}
            </h3>
            <ReasonBadge reason={group.reason} />
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {group.members.length} copies{group.differingFields.length > 0 && (
              <> &middot; differs in {group.differingFields.map(f => FIELD_LABELS[f] || f).join(', ')}</>
            )}
          </p>
        </div>
      </div>

      {/* Shared fields */}
      {sharedFields.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50">
          {sharedFields.map(({ label, value }) => (
            <div key={label} className="text-[11px] text-gray-500">
              <span className="text-gray-400">{label}:</span> {value}
            </div>
          ))}
        </div>
      )}

      {/* Members — show differing fields */}
      <div className="divide-y divide-gray-50">
        {group.members.map((member) => (
          <Link
            key={member.id}
            href={`/agents/${encodeURIComponent(member.id)}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700 group-hover:text-blue-600 transition-colors truncate">
                  {member.name}
                </span>
                {group.differingFields.includes('platform') && (
                  <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${PLATFORM_COLORS[member.platform] || 'bg-gray-100 text-gray-500'}`}>
                    {PLATFORM_LABELS[member.platform] || member.platform}
                  </span>
                )}
                {group.differingFields.includes('scope') && (
                  <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {member.scope}
                  </span>
                )}
              </div>
              {group.differingFields.includes('purpose') && (
                <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                  {member.purpose}
                </p>
              )}
            </div>
            {group.differingFields.includes('model_hint') && member.model_hint && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                {member.model_hint}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

interface SprawlReportProps {
  result: DedupResult;
}

export default function SprawlReport({ result }: SprawlReportProps) {
  const { groups, ungroupedCount } = result;
  const totalDuped = groups.reduce((sum, g) => sum + g.members.length, 0);

  if (groups.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500">
          No duplicates detected. Your Yard is clean.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500">
        Found <span className="font-semibold text-gray-700">{groups.length} group{groups.length !== 1 ? 's' : ''}</span> of
        duplicates across <span className="font-semibold text-gray-700">{totalDuped} passports</span>
        {ungroupedCount > 0 && (
          <> &middot; {ungroupedCount} unique</>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {groups.map((group, i) => (
          <GroupCard key={i} group={group} />
        ))}
      </div>
    </div>
  );
}
