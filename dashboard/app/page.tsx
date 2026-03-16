'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import InspectorGraph from '@/components/InspectorGraph';
import ScanButton from '@/components/ScanButton';
import { Swords, Inbox, Network, ArrowRight, Zap, FileText, Link2 } from 'lucide-react';
import { getModeConfig, MODE_COLORS, MODE_ORDER } from '@/lib/modes';

interface MobMember {
  passport_id: string;
  name: string;
  type: string;
  purpose: string;
  invocation: string | null;
  source_file: string;
  mode: string | null;
  sub_mob_ids?: string[];
}

interface MobEdge {
  source_id: string;
  target_id: string;
  edge_type: string;
  evidence: string;
}

interface SubMobInfo {
  id: string;
  name: string;
  description: string;
  display_order: number;
  member_ids: string[];
}

interface DiscoveredMob {
  id: string;
  name: string;
  members: MobMember[];
  edges: MobEdge[];
  children?: SubMobInfo[];
}

interface ScanDiff {
  added: number;
  removed: number;
  updated: number;
  total: number;
  added_names: string[];
  removed_names: string[];
}

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  subagent: { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Agent' },
  skill: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Skill' },
  mcp: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'MCP' },
  project: { bg: 'bg-gray-50', text: 'text-gray-600', label: 'Project' },
  settings: { bg: 'bg-gray-50', text: 'text-gray-500', label: 'Settings' },
  extension: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Extension' },
};

function toDisplayPath(filePath: string): string {
  const home = typeof window !== 'undefined' ? '' : '';
  return filePath.replace(/^\/Users\/[^/]+/, '~');
}

/** Compute mode distribution for a list of members */
function getModeDistribution(members: MobMember[]): Array<{ mode: string; count: number; hex: string }> {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (m.mode) {
      const key = m.mode.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (counts.size === 0) return [];
  // Sort by MODE_ORDER, then alphabetical for custom modes
  const ordered = [...counts.entries()].sort((a, b) => {
    const idxA = (MODE_ORDER as readonly string[]).indexOf(a[0]);
    const idxB = (MODE_ORDER as readonly string[]).indexOf(b[0]);
    const posA = idxA >= 0 ? idxA : 100;
    const posB = idxB >= 0 ? idxB : 100;
    return posA - posB || a[0].localeCompare(b[0]);
  });
  return ordered.map(([mode, count]) => ({
    mode,
    count,
    hex: MODE_COLORS[mode]?.hex ?? '#6b7280',
  }));
}

export default function InspectorPage() {
  const [mobs, setMobs] = useState<DiscoveredMob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMobId, setSelectedMobId] = useState<string | null>(null);
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null);
  const [activeSubMob, setActiveSubMob] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const detailRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchMobs = useCallback(async () => {
    try {
      const res = await fetch('/api/discovered-mobs');
      if (res.ok) {
        const data: DiscoveredMob[] = await res.json();
        setMobs(data);
        if (data.length > 0 && !selectedMobId) {
          setSelectedMobId(data[0].id);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedMobId]);

  useEffect(() => {
    fetchMobs();
  }, [fetchMobs]);

  const selectedMob = mobs.find(m => m.id === selectedMobId) || null;

  const handleNodeClick = useCallback((passportId: string) => {
    setHighlightedNode(passportId);
    const el = detailRefs.current.get(passportId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  function handleScanComplete(_diff: ScanDiff) {
    fetchMobs();
  }

  const isEmpty = !loading && mobs.length === 0;

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col">
      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-gray-400 animate-pulse">Discovering mobs...</div>
        </div>
      )}

      {/* Empty — no mobs discovered */}
      {isEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gray-100 items-center justify-center mb-4">
              <Network size={24} className="text-gray-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No mobs discovered</h2>
            <p className="text-sm text-gray-500 mb-4">
              Run a scan to discover your agents and their connections. Whizmob will automatically find agent systems.
            </p>
            <ScanButton onScanComplete={handleScanComplete} />
            <p className="text-xs text-gray-400 mt-4">
              Or browse your{' '}
              <Link href="/agents" className="text-indigo-600 hover:underline">full inventory</Link>
            </p>
          </div>
        </div>
      )}

      {/* Inspector layout */}
      {!loading && mobs.length > 0 && (
        <div className="flex-1 flex min-h-0">
          {/* Left: Mob list */}
          <div className="w-64 border-r border-gray-200 bg-gray-50/50 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Discovered Mobs</h2>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{mobs.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {mobs.map(mob => {
                const modeDist = getModeDistribution(mob.members);
                const totalWithMode = modeDist.reduce((sum, d) => sum + d.count, 0);
                return (
                  <button
                    key={mob.id}
                    onClick={() => { setSelectedMobId(mob.id); setHighlightedNode(null); setActiveSubMob(null); setModeFilter(null); }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                      selectedMobId === mob.id
                        ? 'bg-white border-l-2 border-l-indigo-500'
                        : 'hover:bg-white border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">{mob.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                      <span>{mob.members.length} agents</span>
                      <span>&middot;</span>
                      <span>{mob.edges.length} connections</span>
                      {mob.children && mob.children.length > 0 && (
                        <>
                          <span>&middot;</span>
                          <span>{mob.children.length} sub-mobs</span>
                        </>
                      )}
                    </div>
                    {/* Mode composition bar */}
                    {modeDist.length > 0 && (
                      <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-gray-100" title={modeDist.map(d => `${d.mode}: ${d.count}`).join(', ')}>
                        {modeDist.map(d => (
                          <div
                            key={d.mode}
                            className="h-full transition-all"
                            style={{
                              width: `${(d.count / totalWithMode) * 100}%`,
                              backgroundColor: d.hex,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-200">
              <Link
                href="/agents"
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Full Inventory
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>

          {/* Right: Graph + Detail */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedMob ? (
              <>
                {/* Top: Graph */}
                <div className="h-[45%] p-4 pb-2 shrink-0">
                  <InspectorGraph
                    members={selectedMob.members}
                    edges={selectedMob.edges}
                    children={selectedMob.children}
                    onNodeClick={handleNodeClick}
                    onSubMobClick={setActiveSubMob}
                    highlightId={highlightedNode}
                    activeSubMob={activeSubMob}
                  />
                </div>

                {/* Bottom: Component detail cards */}
                <div className="flex-1 overflow-y-auto p-4 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {activeSubMob
                        ? `${selectedMob.children?.find(c => c.id === activeSubMob)?.name || 'Sub-mob'} Components`
                        : `Components \u00B7 ${selectedMob.members.length}`}
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* Mode filter chips */}
                      {getModeDistribution(selectedMob.members).length > 0 && (
                        <div className="flex items-center gap-1">
                          {getModeDistribution(selectedMob.members).map(d => {
                            const cfg = getModeConfig(d.mode);
                            if (!cfg) return null;
                            const isActive = modeFilter === d.mode;
                            return (
                              <button
                                key={d.mode}
                                onClick={() => setModeFilter(isActive ? null : d.mode)}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                  isActive
                                    ? `${cfg.bg} ${cfg.text} ring-1 ring-current`
                                    : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                }`}
                                title={`${cfg.label}: ${d.count} agent${d.count !== 1 ? 's' : ''}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.hex }} />
                                {d.count}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {(activeSubMob || modeFilter) && (
                        <button
                          onClick={() => { setActiveSubMob(null); setModeFilter(null); }}
                          className="text-[11px] text-gray-400 hover:text-gray-600"
                        >
                          Show all
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {selectedMob.members
                      .filter(member => !activeSubMob || member.sub_mob_ids?.includes(activeSubMob))
                      .filter(member => !modeFilter || (member.mode && member.mode.toLowerCase() === modeFilter))
                      .map(member => {
                      const typeInfo = TYPE_COLORS[member.type] || TYPE_COLORS.project;
                      const isHighlighted = highlightedNode === member.passport_id;
                      // Find this member's connections
                      const connections = selectedMob.edges.filter(
                        e => e.source_id === member.passport_id || e.target_id === member.passport_id
                      );
                      return (
                        <div
                          key={member.passport_id}
                          ref={el => {
                            if (el) detailRefs.current.set(member.passport_id, el);
                          }}
                          onClick={() => setHighlightedNode(member.passport_id)}
                          className={`rounded-lg border p-4 cursor-pointer transition-all duration-200 ${
                            isHighlighted
                              ? 'border-indigo-300 bg-indigo-50/30 shadow-sm ring-1 ring-indigo-200'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/passport/${encodeURIComponent(member.passport_id)}`}
                                  className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate transition-colors"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {member.name}
                                </Link>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeInfo.bg} ${typeInfo.text}`}>
                                  {typeInfo.label}
                                </span>
                                {(() => {
                                  const modeCfg = getModeConfig(member.mode);
                                  if (!modeCfg) return null;
                                  return (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setModeFilter(modeFilter === member.mode?.toLowerCase() ? null : member.mode?.toLowerCase() ?? null); }}
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${modeCfg.bg} ${modeCfg.text} hover:ring-1 hover:ring-current transition-all`}
                                    >
                                      {modeCfg.label}
                                    </button>
                                  );
                                })()}
                              </div>
                              <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                {member.purpose}
                              </p>
                            </div>
                          </div>

                          {/* Metadata row */}
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                            {member.invocation && (
                              <span className="flex items-center gap-1">
                                <Zap size={10} />
                                <code className="font-mono">{member.invocation}</code>
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <FileText size={10} />
                              {toDisplayPath(member.source_file).split('/').pop()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Link2 size={10} />
                              {connections.length} connection{connections.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                Select a mob to inspect
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
