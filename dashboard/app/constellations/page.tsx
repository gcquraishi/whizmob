'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Orbit, Package, User, Inbox } from 'lucide-react';

interface Constellation {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
}

export default function ConstellationsPage() {
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConstellations = useCallback(async () => {
    const res = await fetch('/api/constellations');
    if (res.ok) {
      setConstellations(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConstellations();
  }, [fetchConstellations]);

  const isEmpty = !loading && constellations.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Orbit size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Constellations</h1>
            <p className="text-xs text-gray-500">Agent systems &mdash; groups of agents, skills, hooks, and config that work together</p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="space-y-3">
                <div className="h-5 bg-gray-100 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-20">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gray-100 items-center justify-center mb-4">
            <Inbox size={24} className="text-gray-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">No constellations yet</h2>
          <p className="text-sm text-gray-500">
            Create one from the CLI: <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">ronin constellation define &quot;my-system&quot;</code>
          </p>
        </div>
      )}

      {/* Constellation cards */}
      {!loading && constellations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {constellations.map((c) => (
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
    </div>
  );
}
