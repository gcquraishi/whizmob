'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Zap, Plug, FolderOpen, Settings, FileText, ExternalLink, Plus } from 'lucide-react';
import TagPill from '@/components/TagPill';
import clsx from 'clsx';
import { PLATFORM_LABELS } from '@/lib/platforms';

interface Passport {
  id: string;
  name: string;
  type: string;
  platform: string;
  scope: string;
  purpose: string;
  model_hint: string | null;
  invocation: string | null;
  status: string;
  source_file: string;
  metadata_json: string;
  first_seen_at: string;
  updated_at: string;
  tags: string[];
}

const typeIcons: Record<string, { icon: typeof Bot; color: string; bg: string; label: string }> = {
  subagent: { icon: Bot, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Agent' },
  skill: { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Skill' },
  mcp: { icon: Plug, color: 'text-purple-600', bg: 'bg-purple-50', label: 'MCP Server' },
  project: { icon: FolderOpen, color: 'text-green-600', bg: 'bg-green-50', label: 'Project' },
  settings: { icon: Settings, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Settings' },
};

export default function DossierPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [passport, setPassport] = useState<Passport | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPassport = useCallback(async () => {
    const res = await fetch(`/api/inventory/${encodeURIComponent(id)}`);
    if (res.ok) {
      setPassport(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchPassport();
  }, [fetchPassport]);

  async function addTag() {
    if (!passport || !tagInput.trim()) return;
    const newTags = [...passport.tags, tagInput.trim().toLowerCase()];
    setSaving(true);
    await fetch(`/api/inventory/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    setTagInput('');
    setSaving(false);
    fetchPassport();
  }

  async function removeTag(tag: string) {
    if (!passport) return;
    const newTags = passport.tags.filter((t) => t !== tag);
    await fetch(`/api/inventory/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    fetchPassport();
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

  if (!passport) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={14} /> Back to Yard
        </button>
        <p className="text-sm text-gray-500">Agent not found.</p>
      </div>
    );
  }

  const cfg = typeIcons[passport.type] || typeIcons.subagent;
  const Icon = cfg.icon;
  const metadata = JSON.parse(passport.metadata_json || '{}');
  const vscodeUrl = `vscode://file${passport.source_file}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* Back */}
      <button onClick={() => router.push('/')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Back to Yard
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className={`w-12 h-12 rounded-xl ${cfg.bg} ${cfg.color} flex items-center justify-center`}>
          <Icon size={24} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{passport.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {passport.model_hint && (
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                {passport.model_hint}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{passport.purpose}</p>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-6">
        <Section title="Details">
          <Field label="ID" value={passport.id} mono />
          <Field label="Platform" value={PLATFORM_LABELS[passport.platform] || passport.platform} />
          <Field label="Scope" value={passport.scope} />
          <Field label="Status" value={passport.status} />
          {passport.invocation && <Field label="Invocation" value={passport.invocation} mono />}
          <Field label="First Seen" value={new Date(passport.first_seen_at).toLocaleDateString()} />
          <Field label="Last Updated" value={new Date(passport.updated_at).toLocaleDateString()} />
        </Section>

        {/* Tags */}
        <Section title="Tags">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {passport.tags.length === 0 && (
              <span className="text-xs text-gray-400">No tags yet</span>
            )}
            {passport.tags.map((tag) => (
              <TagPill key={tag} tag={tag} onRemove={() => removeTag(tag)} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Add a tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
            <button
              onClick={addTag}
              disabled={!tagInput.trim() || saving}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                tagInput.trim()
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </Section>

        {/* Source file */}
        <Section title="Source">
          <div className="flex items-center gap-2 text-sm">
            <FileText size={14} className="text-gray-400" />
            <code className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded font-mono break-all">
              {passport.source_file}
            </code>
            <a
              href={vscodeUrl}
              className="flex-shrink-0 text-blue-600 hover:text-blue-700"
              title="Open in VS Code"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </Section>

        {/* Metadata */}
        {Object.keys(metadata).length > 0 && (
          <Section title="Metadata">
            <pre className="text-xs font-mono text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </Section>
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <dt className="w-28 flex-shrink-0 text-xs font-medium text-gray-500">{label}</dt>
      <dd className={clsx('text-sm text-gray-900', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
