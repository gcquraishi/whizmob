'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, FileText, AlertTriangle, Check, Shield,
  FolderOpen, Package, Loader2, Play, X
} from 'lucide-react';
import clsx from 'clsx';

interface PlanAction {
  file: {
    bundle_path: string;
    original_path: string;
    component_type: string;
    passport_name: string | null;
    secrets_stripped: boolean;
    memory_bootstrapped: boolean;
  };
  targetPath: string;
  conflict: boolean;
  needsSecrets: boolean;
  isBootstrapped: boolean;
}

interface ImportPlan {
  manifest: {
    version: string;
    constellation: { id: string; name: string; description: string };
    exported_at: string;
    exported_from: string;
    files: Array<Record<string, unknown>>;
    dependencies: Array<{ type: string; name: string; required: boolean }>;
  };
  actions: PlanAction[];
  dependencies: Array<{ type: string; name: string; required: boolean; available: boolean }>;
  warnings: string[];
}

interface ImportResult {
  installed: number;
  skipped: number;
  conflicts: number;
  provenanceRecorded: number;
  warnings: string[];
}

export default function ImportPage() {
  const router = useRouter();
  const [bundlePath, setBundlePath] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  async function handlePlan() {
    if (!bundlePath.trim()) return;
    setPlanning(true);
    setPlanError(null);
    setPlan(null);
    setImportResult(null);
    setImportError(null);
    try {
      const res = await fetch('/api/constellations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundlePath: bundlePath.trim(), action: 'plan' }),
      });
      if (res.ok) {
        setPlan(await res.json());
      } else {
        const err = await res.json();
        setPlanError(err.error || 'Failed to plan import');
      }
    } catch {
      setPlanError('Failed to connect to server');
    }
    setPlanning(false);
  }

  async function handleImport() {
    if (!bundlePath.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch('/api/constellations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundlePath: bundlePath.trim(), action: 'execute', force }),
      });
      if (res.ok) {
        setImportResult(await res.json());
      } else {
        const err = await res.json();
        setImportError(err.error || 'Import failed');
      }
    } catch {
      setImportError('Failed to connect to server');
    }
    setImporting(false);
  }

  const hasConflicts = plan?.actions.some(a => a.conflict) ?? false;
  const missingDeps = plan?.dependencies.filter(d => d.required && !d.available) ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Back */}
      <button onClick={() => router.push('/constellations')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Back to Constellations
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <Upload size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import Constellation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Import a constellation bundle exported from another machine or account.
            Point to the bundle directory to preview what will be installed.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Bundle path input */}
        <Section title="Bundle Location">
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Enter the absolute path to an exported constellation bundle (the directory containing <code className="bg-gray-100 px-1 rounded">manifest.json</code>).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={bundlePath}
                onChange={(e) => setBundlePath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePlan()}
                placeholder="~/.ronin/exports/ceo-operating-system"
                className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                onClick={handlePlan}
                disabled={planning || !bundlePath.trim()}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  planning || !bundlePath.trim()
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                )}
              >
                {planning ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                Preview
              </button>
            </div>
          </div>
        </Section>

        {/* Plan error */}
        {planError && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 border border-red-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            {planError}
          </div>
        )}

        {/* Plan results */}
        {plan && !importResult && (
          <>
            {/* Constellation info */}
            <Section title="Constellation">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-900">{plan.manifest.constellation.name}</div>
                {plan.manifest.constellation.description && (
                  <p className="text-xs text-gray-500">{plan.manifest.constellation.description}</p>
                )}
                <div className="flex gap-4 text-[11px] text-gray-400 mt-2">
                  <span>Exported from: {plan.manifest.exported_from}</span>
                  <span>At: {new Date(plan.manifest.exported_at).toLocaleString()}</span>
                </div>
              </div>
            </Section>

            {/* Actions preview */}
            <Section title={`Files to install (${plan.actions.length})`}>
              <div className="space-y-1">
                {plan.actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50">
                    <FileText size={13} className="text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-mono text-gray-700 truncate" title={action.targetPath}>
                        {action.targetPath.replace(/^\/Users\/[^/]+/, '~')}
                      </div>
                      {action.file.passport_name && (
                        <div className="text-[10px] text-gray-400">{action.file.passport_name}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {action.conflict && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600">exists</span>
                      )}
                      {action.needsSecrets && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">needs secrets</span>
                      )}
                      {action.isBootstrapped && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">bootstrapped</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Dependencies */}
            {plan.dependencies.length > 0 && (
              <Section title="Dependencies">
                <div className="space-y-1">
                  {plan.dependencies.map((dep, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 text-xs">
                      {dep.available ? (
                        <Check size={12} className="text-green-500" />
                      ) : (
                        <X size={12} className="text-red-500" />
                      )}
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100">
                        {dep.type === 'mcp_server' ? 'MCP' : 'npm'}
                      </span>
                      <span className={dep.available ? 'text-gray-700' : 'text-red-600 font-medium'}>
                        {dep.name}
                      </span>
                      {dep.required && !dep.available && (
                        <span className="text-red-500">(required, missing)</span>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Warnings */}
            {plan.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">Warnings ({plan.warnings.length})</span>
                </div>
                <div className="space-y-1">
                  {plan.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-700">{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Import controls */}
            <Section title="Install">
              <div className="space-y-3">
                {hasConflicts && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={force}
                      onChange={(e) => setForce(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Force overwrite existing files ({plan.actions.filter(a => a.conflict).length} conflicts)
                  </label>
                )}
                {missingDeps.length > 0 && (
                  <p className="text-xs text-amber-600">
                    {missingDeps.length} required dependency(ies) missing. Import may work but the constellation may not function correctly.
                  </p>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    importing
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  )}
                >
                  {importing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Install Constellation
                    </>
                  )}
                </button>
              </div>
            </Section>
          </>
        )}

        {/* Import error */}
        {importError && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 border border-red-200">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            {importError}
          </div>
        )}

        {/* Import success */}
        {importResult && (
          <div className="border border-green-200 bg-green-50 rounded-lg overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-green-200">
              <Check size={14} className="text-green-600" />
              <span className="text-sm font-medium text-green-800">Import complete</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex flex-wrap gap-4 text-xs text-green-700">
                <span className="flex items-center gap-1">
                  <Package size={12} />
                  {importResult.installed} installed
                </span>
                {importResult.skipped > 0 && (
                  <span className="flex items-center gap-1">
                    <X size={12} />
                    {importResult.skipped} skipped
                  </span>
                )}
                {importResult.conflicts > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle size={12} />
                    {importResult.conflicts} conflicts
                  </span>
                )}
                {importResult.provenanceRecorded > 0 && (
                  <span className="flex items-center gap-1">
                    <Shield size={12} />
                    {importResult.provenanceRecorded} provenance recorded
                  </span>
                )}
              </div>
              {importResult.warnings.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] text-amber-600 mb-1">Post-import notes:</p>
                  {importResult.warnings.filter(w => w.includes('secrets stripped') || w.includes('configure credentials')).map((w, i) => (
                    <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
                      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-xs text-green-600 pt-2">
                Run <code className="bg-green-100 px-1.5 py-0.5 rounded font-mono">ronin scan</code> to register the imported agents in your inventory.
              </p>
            </div>
          </div>
        )}
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
