'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Orbit, Bot, Zap, Plug, FolderOpen, Settings,
  FileText, Package, User, Calendar, Download, Check, AlertTriangle,
  Shield, Loader2
} from 'lucide-react';
import { clsx } from 'clsx';
import { toDisplayPath } from '@/lib/paths';
import TagPill from '@/components/TagPill';

const groupPluralLabels: Record<string, string> = {
  memory_schema: 'Memory Schemas',
  claude_md: 'CLAUDE.md Files',
  passport: 'Passports',
  hook: 'Hooks',
  config: 'Configs',
  passport_source: 'Sources',
};

interface MobComponent {
  passport_id: string | null;
  passport_name: string | null;
  passport_type: string | null;
  component_type: string;
  file_path: string | null;
  role: string | null;
  purpose: string | null;
  invocation: string | null;
  scope: string | null;
  tags: string[];
}

interface MobDetail {
  id: string;
  name: string;
  description: string;
  author: string | null;
  component_count: number;
  created_at: string;
  updated_at: string;
  components: MobComponent[];
}

interface ExportResult {
  bundleDir: string;
  fileCount: number;
  secretsStripped: number;
  memoryBootstrapped: number;
  warnings: string[];
  manifest: {
    version: string;
    mob: { id: string; name: string };
    exported_at: string;
    exported_from: string;
    files: Array<{
      bundle_path: string;
      original_path: string;
      component_type: string;
      passport_name: string | null;
      secrets_stripped: boolean;
      memory_bootstrapped: boolean;
    }>;
    dependencies: Array<{ type: string; name: string; required: boolean }>;
  };
}

const typeConfig: Record<string, { icon: typeof Bot; color: string; bg: string; label: string }> = {
  passport: { icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Passport' },
  passport_source: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Source' },
  hook: { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Hook' },
  memory_schema: { icon: FolderOpen, color: 'text-green-600', bg: 'bg-green-50', label: 'Memory' },
  claude_md: { icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50', label: 'CLAUDE.md' },
  config: { icon: Settings, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Config' },
};

const passportTypeConfig: Record<string, { icon: typeof Bot; color: string; bg: string }> = {
  subagent: { icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50' },
  skill: { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
  mcp: { icon: Plug, color: 'text-purple-600', bg: 'bg-purple-50' },
  project: { icon: FolderOpen, color: 'text-green-600', bg: 'bg-green-50' },
  settings: { icon: Settings, color: 'text-gray-600', bg: 'bg-gray-100' },
};

export default function MobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [mob, setMob] = useState<MobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchMob = useCallback(async () => {
    const res = await fetch(`/api/mobs/${encodeURIComponent(id)}`);
    if (res.ok) {
      setMob(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchMob();
  }, [fetchMob]);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const res = await fetch(`/api/mobs/${encodeURIComponent(id)}/export`, {
        method: 'POST',
      });
      if (res.ok) {
        setExportResult(await res.json());
      } else {
        const err = await res.json();
        setExportError(err.error || 'Export failed');
      }
    } catch {
      setExportError('Export failed — check console');
    }
    setExporting(false);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-100 rounded w-48" />
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!mob) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <button onClick={() => router.push('/mobs')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={14} /> Back to Mobs
        </button>
        <p className="text-sm text-gray-500">Mob not found.</p>
      </div>
    );
  }

  // Group components by type
  const grouped = mob.components.reduce<Record<string, MobComponent[]>>((acc, c) => {
    const key = c.component_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Back */}
      <button onClick={() => router.push('/mobs')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Back to Mobs
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Orbit size={24} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{mob.name}</h1>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
              {mob.component_count} component{mob.component_count !== 1 ? 's' : ''}
            </span>
          </div>
          {mob.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{mob.description}</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Meta */}
        <Section title="Details">
          <Field label="ID" value={mob.id} mono />
          {mob.author && <Field label="Author" value={mob.author} />}
          <Field label="Created" value={new Date(mob.created_at).toLocaleDateString()} />
          <Field label="Updated" value={new Date(mob.updated_at).toLocaleDateString()} />
        </Section>

        {/* Components by type */}
        <Section title="Components">
          <div className="space-y-4">
            {Object.entries(grouped).map(([type, components]) => {
              const cfg = typeConfig[type] || typeConfig.config;
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <cfg.icon size={14} className={cfg.color} />
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{groupPluralLabels[type] || `${cfg.label}s`}</h3>
                    <span className="text-[10px] text-gray-400">{components.length}</span>
                  </div>
                  <div className="space-y-1">
                    {components.map((comp, i) => (
                      <ComponentRow key={i} component={comp} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Export */}
        <Section title="Export">
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Export this mob as a portable bundle. Secrets are stripped, paths are parameterized, and memory schemas are bootstrapped (structure only, no data).
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                exporting
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              )}
            >
              {exporting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={14} />
                  Export Bundle
                </>
              )}
            </button>

            {exportError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                {exportError}
              </div>
            )}

            {exportResult && (
              <ExportResultCard result={exportResult} />
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function ComponentRow({ component }: { component: MobComponent }) {
  const isPassport = component.component_type === 'passport' && component.passport_id;
  const pCfg = isPassport && component.passport_type
    ? passportTypeConfig[component.passport_type] || passportTypeConfig.subagent
    : null;

  const name = component.passport_name || component.file_path || '(unknown)';
  const displayPath = component.file_path
    ? toDisplayPath(component.file_path)
    : null;

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="mt-0.5">
        {pCfg ? (
          <pCfg.icon size={13} className={pCfg.color} />
        ) : (
          <FileText size={13} className="text-gray-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isPassport ? (
            <Link
              href={`/agents/${encodeURIComponent(component.passport_id!)}`}
              className="text-sm text-gray-900 hover:text-indigo-600 transition-colors"
            >
              {name}
            </Link>
          ) : (
            <span className="text-sm text-gray-900">{name}</span>
          )}
          {component.invocation && (
            <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{component.invocation}</code>
          )}
          {component.role && (
            <span className="text-[10px] text-gray-400">{component.role}</span>
          )}
        </div>
        {isPassport && component.purpose && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{component.purpose}</p>
        )}
        {isPassport && component.tags && component.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {component.tags.map(tag => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
        )}
      </div>
      {displayPath && !isPassport && (
        <code className="text-[10px] text-gray-400 font-mono truncate max-w-48 mt-0.5">{displayPath}</code>
      )}
    </div>
  );
}

function ExportResultCard({ result }: { result: ExportResult }) {
  return (
    <div className="border border-green-200 bg-green-50 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-green-200">
        <Check size={14} className="text-green-600" />
        <span className="text-sm font-medium text-green-800">Export complete</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap gap-4 text-xs text-green-700">
          <span className="flex items-center gap-1">
            <Package size={12} />
            {result.fileCount} files
          </span>
          {result.secretsStripped > 0 && (
            <span className="flex items-center gap-1">
              <Shield size={12} />
              {result.secretsStripped} secrets stripped
            </span>
          )}
          {result.memoryBootstrapped > 0 && (
            <span className="flex items-center gap-1">
              <FolderOpen size={12} />
              {result.memoryBootstrapped} memory bootstrapped
            </span>
          )}
        </div>
        <div className="pt-1">
          <p className="text-[11px] text-green-600 mb-1">Bundle location:</p>
          <code className="text-xs text-green-800 bg-green-100 px-2 py-1 rounded font-mono block break-all">
            {result.bundleDir}
          </code>
        </div>

        {/* Dependencies */}
        {result.manifest.dependencies.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] text-green-600 mb-1">Dependencies:</p>
            <div className="space-y-1">
              {result.manifest.dependencies.map((dep, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-green-700">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100">
                    {dep.type === 'mcp_server' ? 'MCP' : 'npm'}
                  </span>
                  {dep.name}
                  {dep.required && <span className="text-[10px] text-green-500">(required)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] text-amber-600 mb-1">Warnings:</p>
            {result.warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}

        {/* Files in bundle */}
        <div className="pt-2">
          <p className="text-[11px] text-green-600 mb-1">Exported files:</p>
          <div className="space-y-0.5">
            {result.manifest.files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-green-700">
                <code className="font-mono text-[10px]">{f.bundle_path}</code>
                {f.secrets_stripped && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-600">redacted</span>
                )}
                {f.memory_bootstrapped && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-600">bootstrapped</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="w-28 flex-shrink-0 text-xs font-medium text-gray-500">{label}</dt>
      <dd className={clsx('text-sm text-gray-900', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
