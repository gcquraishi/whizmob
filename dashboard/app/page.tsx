'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import SummaryStats from '@/components/SummaryStats';
import SearchBar from '@/components/SearchBar';
import TypeFilter from '@/components/TypeFilter';
import PlatformFilter from '@/components/PlatformFilter';
import AgentCard from '@/components/AgentCard';
import ScanButton from '@/components/ScanButton';
import SprawlToggle from '@/components/SprawlToggle';
import SprawlReport from '@/components/SprawlReport';
import DiffModal from '@/components/DiffModal';
import { computeDedupGroups } from '@/lib/dedup';
import { Swords, Inbox } from 'lucide-react';

interface Passport {
  id: string;
  name: string;
  type: string;
  platform: string;
  purpose: string;
  model_hint: string | null;
  tags: string[];
  scope: string;
  metadata_json: string;
}

interface ScanDiff {
  added: number;
  removed: number;
  updated: number;
  total: number;
  added_names: string[];
  removed_names: string[];
}

export default function YardPage() {
  const [allPassports, setAllPassports] = useState<Passport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'sprawl'>('grid');
  const [diff, setDiff] = useState<ScanDiff | null>(null);
  const [lastScan, setLastScan] = useState<{ scanned_at: string; total: number } | null>(null);

  // Fetch all passports once on mount (and after scans)
  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/inventory');
    if (res.ok) {
      setAllPassports(await res.json());
    }
    setLoading(false);
  }, []);

  // Fetch last scan metadata
  const fetchLastScan = useCallback(async () => {
    const res = await fetch('/api/scan');
    if (res.ok) {
      setLastScan(await res.json());
    }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchLastScan();
  }, [fetchAll, fetchLastScan]);

  // Client-side filtering — instant, no network round-trip
  const passports = useMemo(() => {
    let result = allPassports;
    if (typeFilter) {
      result = result.filter(p => p.type === typeFilter);
    }
    if (platformFilter) {
      result = result.filter(p => p.platform === platformFilter);
    }
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.purpose.toLowerCase().includes(term)
      );
    }
    return result;
  }, [allPassports, typeFilter, platformFilter, search]);

  const dedupResult = useMemo(() => computeDedupGroups(allPassports), [allPassports]);

  function handleScanComplete(scanDiff: ScanDiff) {
    setDiff(scanDiff);
    fetchAll();
    fetchLastScan();
  }

  // Compute counts from unfiltered data
  const counts: Record<string, number> = {};
  allPassports.forEach((p) => {
    counts[p.type] = (counts[p.type] || 0) + 1;
  });

  // Compute platform counts from unfiltered data
  const platformCounts: Record<string, number> = {};
  allPassports.forEach((p) => {
    platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1;
  });
  const platforms = Object.keys(platformCounts).sort();

  // Find most recently active project
  const mostRecentProject = useMemo(() => allPassports
    .filter(p => p.type === 'project')
    .reduce<{ name: string; date: string } | null>((best, p) => {
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(p.metadata_json || '{}'); } catch { /* skip */ }
      const lastActive = meta.last_active as string | undefined;
      if (!lastActive) return best;
      if (!best || lastActive > best.date) return { name: p.name, date: lastActive };
      return best;
    }, null), [allPassports]);

  const isEmpty = !loading && allPassports.length === 0 && !search && !typeFilter && !platformFilter;
  const noResults = !loading && passports.length === 0 && (search || typeFilter || platformFilter);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center">
            <Swords size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Ronin</h1>
            <p className="text-xs text-gray-500">Agent Control Plane</p>
          </div>
        </div>
        <ScanButton onScanComplete={handleScanComplete} />
      </div>

      {/* Summary + Filters */}
      {!isEmpty && (
        <div className="space-y-4 mb-6">
          {!typeFilter && !search && !platformFilter && (
            <SummaryStats counts={counts} platformCounts={platformCounts} mostRecentProject={mostRecentProject} lastScan={lastScan} dedupGroups={dedupResult.groups.length} dedupPassports={dedupResult.groups.reduce((sum, g) => sum + g.members.length, 0)} />
          )}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full sm:w-auto">
              <SearchBar value={search} onChange={setSearch} />
            </div>
            <PlatformFilter value={platformFilter} onChange={setPlatformFilter} platforms={platforms} />
            <TypeFilter value={typeFilter} onChange={setTypeFilter} />
            <SprawlToggle mode={viewMode} onChange={setViewMode} groupCount={dedupResult.groups.length} />
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty — never scanned */}
      {isEmpty && (
        <div className="text-center py-20">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gray-100 items-center justify-center mb-4">
            <Inbox size={24} className="text-gray-400" />
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">No agents yet</h2>
          <p className="text-sm text-gray-500 mb-4">
            Click &ldquo;Scan Now&rdquo; to discover your agents, skills, and projects across all platforms.
          </p>
        </div>
      )}

      {/* No search results */}
      {noResults && viewMode === 'grid' && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">
            No results found.{' '}
            <button
              onClick={() => { setSearch(''); setTypeFilter(''); setPlatformFilter(''); }}
              className="text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </p>
        </div>
      )}

      {/* Sprawl report */}
      {!loading && viewMode === 'sprawl' && !isEmpty && (
        <SprawlReport result={dedupResult} />
      )}

      {/* Card grid */}
      {!loading && viewMode === 'grid' && passports.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {passports.map((p) => (
            <AgentCard
              key={p.id}
              id={p.id}
              name={p.name}
              type={p.type}
              platform={p.platform}
              purpose={p.purpose}
              model_hint={p.model_hint}
              tags={p.tags}
              scope={p.scope}
              showPlatformBadge={platforms.length > 1}
            />
          ))}
        </div>
      )}

      {/* Diff Modal */}
      {diff && <DiffModal diff={diff} onClose={() => setDiff(null)} />}
    </div>
  );
}
