'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Orbit, Package, User, Inbox, Upload, LayoutGrid, Network } from 'lucide-react';
import clsx from 'clsx';
import MobGraph from '@/components/MobGraph';

interface Mob {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
}

interface GraphData {
  nodes: Array<{
    id: string;
    type: 'mob' | 'component';
    label: string;
    component_type?: string;
    passport_type?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'contains' | 'shared';
  }>;
}

type ViewMode = 'cards' | 'graph';

export default function MobsPage() {
  const [mobs, setMobs] = useState<Mob[]>([]);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('graph');

  useEffect(() => {
    Promise.all([
      fetch('/api/constellations').then(r => r.json()),
      fetch('/api/mobs/graph').then(r => r.json()),
    ]).then(([mobsData, graph]) => {
      setMobs(mobsData);
      setGraphData(graph);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const isEmpty = !loading && mobs.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 h-[calc(100vh-48px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Orbit size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Mobs</h1>
            <p className="text-xs text-gray-500">Agent systems &mdash; groups of agents, skills, hooks, and config that work together</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('cards')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'cards' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <LayoutGrid size={12} />
              Cards
            </button>
            <button
              onClick={() => setView('graph')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                view === 'graph' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Network size={12} />
              Graph
            </button>
          </div>
          <Link
            href="/constellations/import"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            <Upload size={14} />
            Import
          </Link>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-gray-400 animate-pulse">Loading mobs...</div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gray-100 items-center justify-center mb-4">
              <Inbox size={24} className="text-gray-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No mobs yet</h2>
            <p className="text-sm text-gray-500">
              Create one from the CLI: <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">whizmob constellation define &quot;my-system&quot;</code>
            </p>
          </div>
        </div>
      )}

      {/* Card view */}
      {!loading && mobs.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {mobs.map((c) => (
            <Link
              key={c.id}
              href={`/constellations/${encodeURIComponent(c.id)}`}
              className="group block bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all duration-150"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Orbit size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                    {c.name}
                  </h3>
                  {c.description && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Package size={11} />
                      {c.component_count} component{c.component_count !== 1 ? 's' : ''}
                    </span>
                    {c.author && (
                      <span className="flex items-center gap-1">
                        <User size={11} />
                        {c.author}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Graph view */}
      {!loading && mobs.length > 0 && view === 'graph' && graphData && (
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <MobGraph nodes={graphData.nodes} edges={graphData.edges} />
        </div>
      )}
    </div>
  );
}
