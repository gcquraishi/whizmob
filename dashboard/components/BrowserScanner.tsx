'use client';

import { useState, useCallback } from 'react';
import {
  browserScan,
  isFileSystemAccessSupported,
  type BrowserScanResult,
  type ProtoPassport,
} from '../lib/browser-scanner';
import InspectorGraph from './InspectorGraph';

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: BrowserScanResult }
  | { status: 'empty'; dirName: string }
  | { status: 'error'; message: string };

const TYPE_LABELS: Record<string, string> = {
  subagent: 'Agents',
  skill: 'Skills',
  mcp: 'MCP Servers',
  project: 'Projects',
  settings: 'Settings',
  extension: 'Extensions',
};

function PassportDetail({ passport }: { passport: ProtoPassport }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-[#1a1a1a]">{passport.name}</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
          {passport.type}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
          {passport.platform}
        </span>
      </div>
      {passport.purpose && (
        <p className="text-gray-500 text-xs mb-2">{passport.purpose}</p>
      )}
      {passport.invocation && (
        <p className="text-xs font-mono text-[#12497a]">{passport.invocation}</p>
      )}
      <p className="text-xs text-gray-400 mt-1 font-mono truncate">{passport.source_file}</p>
    </div>
  );
}

export default function BrowserScanner() {
  const [state, setState] = useState<ScanState>({ status: 'idle' });
  const [selectedPassport, setSelectedPassport] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const supported = isFileSystemAccessSupported();

  const handleScan = useCallback(async () => {
    try {
      setState({ status: 'scanning' });

      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
      });

      const result = await browserScan(dirHandle);

      if (result.passports.length === 0) {
        setState({ status: 'empty', dirName: result.dirName });
      } else {
        setState({ status: 'done', result });
      }
    } catch (err: unknown) {
      // User cancelled the picker
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState({ status: 'idle' });
        return;
      }
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error during scan',
      });
    }
  }, []);

  const handleNodeClick = useCallback((passportId: string) => {
    setSelectedPassport(passportId);
    setHighlightId(passportId);
  }, []);

  // Unsupported browser: show CLI fallback
  if (!supported) {
    return (
      <div className="w-full">
        <div className="terminal">
          <div>
            <span className="prompt">$ </span>npx whizmob scan --open
          </div>
          <div className="output mt-1">
            Scans your machine and opens the dashboard in your browser.
          </div>
        </div>
        <p className="text-xs text-[#6b7280] mt-3">
          Browser scanning requires Chrome or Edge. Use the CLI for other browsers.
        </p>
      </div>
    );
  }

  // Idle state
  if (state.status === 'idle') {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <button
          onClick={handleScan}
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a1a1a] text-white text-sm font-medium rounded-lg hover:bg-[#333] transition-colors"
        >
          Scan your machine
        </button>
        <p className="text-xs text-[#6b7280] text-center max-w-md">
          Opens a folder picker. Select your <code className="text-[#12497a]">~/.claude/</code> directory
          (or any AI tool config folder). Nothing leaves your browser.
        </p>
      </div>
    );
  }

  // Scanning state
  if (state.status === 'scanning') {
    return (
      <div className="w-full flex flex-col items-center gap-3 py-8">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-[#1a1a1a] rounded-full animate-spin" />
        <p className="text-sm text-[#6b7280]">Reading files...</p>
      </div>
    );
  }

  // Error state
  if (state.status === 'error') {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 max-w-md text-center">
          {state.message}
        </div>
        <button
          onClick={handleScan}
          className="text-sm text-[#12497a] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Empty state
  if (state.status === 'empty') {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-6 py-5 text-center max-w-md">
          <p className="text-sm font-medium text-[#1a1a1a] mb-2">
            No agents found in <code className="text-[#12497a]">{state.dirName}</code>
          </p>
          <p className="text-xs text-[#6b7280]">
            Try selecting a directory that contains AI tool configs &mdash; like{' '}
            <code className="text-[#12497a]">.claude</code>,{' '}
            <code className="text-[#12497a]">.cursor</code>, or{' '}
            <code className="text-[#12497a]">.codex</code>.
          </p>
        </div>
        <button
          onClick={handleScan}
          className="text-sm text-[#12497a] hover:underline"
        >
          Scan a different folder
        </button>
      </div>
    );
  }

  // Done state: show results
  const { result } = state;
  const byType = new Map<string, number>();
  for (const p of result.passports) {
    byType.set(p.type, (byType.get(p.type) || 0) + 1);
  }

  const selected = selectedPassport
    ? result.passports.find(p => p.id === selectedPassport)
    : null;

  // Convert passports to the shape InspectorGraph expects
  const graphMembers = result.passports.map(p => ({
    passport_id: p.id,
    name: p.name,
    type: p.type,
    purpose: p.purpose,
    invocation: p.invocation || null,
    source_file: p.source_file,
  }));

  const graphEdges = result.edges.map(e => ({
    source_id: e.source_id,
    target_id: e.target_id,
    edge_type: e.edge_type,
    evidence: e.evidence,
  }));

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-[#1a1a1a]">
          <span className="font-semibold">{result.passports.length}</span>
          <span className="text-[#6b7280]">components</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#1a1a1a]">
          <span className="font-semibold">{result.edges.length}</span>
          <span className="text-[#6b7280]">edges</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#1a1a1a]">
          <span className="font-semibold">{result.mobs.length}</span>
          <span className="text-[#6b7280]">mobs</span>
        </div>
        <span className="text-xs text-gray-400">
          {result.scan_duration_ms}ms
        </span>
        <button
          onClick={handleScan}
          className="ml-auto text-xs text-[#12497a] hover:underline"
        >
          Scan again
        </button>
      </div>

      {/* Type breakdown */}
      <div className="flex flex-wrap gap-2">
        {Array.from(byType.entries())
          .sort(([, a], [, b]) => b - a)
          .map(([type, count]) => (
            <span
              key={type}
              className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600"
            >
              {count} {TYPE_LABELS[type] || type}
            </span>
          ))}
      </div>

      {/* Graph + detail panel */}
      <div className="flex gap-4" style={{ minHeight: 400 }}>
        {/* Graph */}
        <div className="flex-1" style={{ minHeight: 400 }}>
          <InspectorGraph
            members={graphMembers}
            edges={graphEdges}
            onNodeClick={handleNodeClick}
            highlightId={highlightId}
          />
        </div>

        {/* Detail sidebar */}
        {selected && (
          <div className="w-72 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Detail
              </span>
              <button
                onClick={() => {
                  setSelectedPassport(null);
                  setHighlightId(null);
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
            <PassportDetail passport={selected} />

            {/* Connected edges */}
            {result.edges.filter(
              e => e.source_id === selected.id || e.target_id === selected.id,
            ).length > 0 && (
              <div className="mt-3">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Connections
                </span>
                <div className="mt-1 space-y-1">
                  {result.edges
                    .filter(e => e.source_id === selected.id || e.target_id === selected.id)
                    .map((e, i) => {
                      const otherId = e.source_id === selected.id ? e.target_id : e.source_id;
                      const other = result.passports.find(p => p.id === otherId);
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setSelectedPassport(otherId);
                            setHighlightId(otherId);
                          }}
                          className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-50 text-gray-600"
                        >
                          <span className="text-[#12497a]">{e.edge_type}</span>{' '}
                          {other?.name || otherId}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mob list */}
      {result.mobs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">
            Discovered Mobs
          </h3>
          <div className="space-y-2">
            {result.mobs.map(mob => (
              <div
                key={mob.id}
                className="border border-gray-200 rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#1a1a1a]">
                    {mob.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {mob.members.length} members, {mob.edgeCount} edges
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {mob.members.map(memberId => {
                    const p = result.passports.find(pp => pp.id === memberId);
                    return (
                      <button
                        key={memberId}
                        onClick={() => {
                          setSelectedPassport(memberId);
                          setHighlightId(memberId);
                        }}
                        className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {p?.name || memberId}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
