'use client';

import { useState } from 'react';
import clsx from 'clsx';

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewMode = 'raw' | 'translated' | 'both';

// ─── Table data ──────────────────────────────────────────────────────────────

const TABLE_ROWS: {
  aspect: string;
  sourceToCanonical: React.ReactNode;
  canonicalToTargets: React.ReactNode;
}[] = [
  {
    aspect: 'Negative prompts',
    sourceToCanonical: (
      <>
        <code className="font-mono text-xs text-gray-700">&quot;NO shading, NO shadows&quot;</code>
        <br />
        <span className="text-gray-400 italic text-xs">Kept as-is — platform-neutral</span>
        <br />
        <RuleTag>PRESERVE</RuleTag>
      </>
    ),
    canonicalToTargets: (
      <>
        <TargetLine platform="DALL-E">
          <code className="font-mono text-xs text-green-700">&quot;Flat solid fills only, hard edges only&quot;</code>
          <Hint>Rephrased as positive — DALL-E handles positive framing better</Hint>
        </TargetLine>
        <TargetLine platform="Midjourney">
          <code className="font-mono text-xs text-green-700">--no shading shadows gradients</code>
          <Hint>Moved to --no parameter — MJ&apos;s native negative syntax</Hint>
        </TargetLine>
        <TargetLine platform="Gemini">
          <span className="text-gray-400 italic text-xs">No change — inline negatives work</span>
        </TargetLine>
      </>
    ),
  },
  {
    aspect: 'Color values',
    sourceToCanonical: (
      <>
        <code className="font-mono text-xs text-red-500 line-through decoration-red-300">getPaletteForFigure(id)</code>
        <br />
        <code className="font-mono text-xs text-green-700">#6B7F5E (muted yellow-green olive)</code>
        <br />
        <RuleTag>GENERALIZE_PATHS</RuleTag>
      </>
    ),
    canonicalToTargets: (
      <>
        <TargetLine platform="DALL-E">
          Both hex + English — DALL-E respects hex reasonably
        </TargetLine>
        <TargetLine platform="Midjourney">
          <code className="font-mono text-xs text-green-700">muted olive green</code>
          {' '}— English only, hex ignored. Use{' '}
          <code className="font-mono text-xs">--sref</code> for palette lock
        </TargetLine>
        <TargetLine platform="Gemini">
          Both hex + English — hex unreliable, English helps
        </TargetLine>
      </>
    ),
  },
  {
    aspect: 'Prompt structure',
    sourceToCanonical: (
      <>
        <span className="text-gray-400 italic text-xs">Full sentences preserved</span>
        <br />
        <RuleTag>PRESERVE</RuleTag>
      </>
    ),
    canonicalToTargets: (
      <>
        <TargetLine platform="DALL-E">
          Full sentences, style keyword moved to front
        </TargetLine>
        <TargetLine platform="Midjourney">
          <code className="font-mono text-xs text-green-700">keywords ::2 more keywords ::1.5</code>
          <Hint>Complete structural rewrite — weighted multi-prompt syntax</Hint>
        </TargetLine>
        <TargetLine platform="Gemini">
          Full sentences, no change
        </TargetLine>
      </>
    ),
  },
  {
    aspect: 'Safety policy',
    sourceToCanonical: (
      <>
        <code className="font-mono text-xs text-red-500 line-through decoration-red-300">Gemini may block</code>
        <br />
        <code className="font-mono text-xs text-green-700">Image generation may block</code>
        <br />
        <RuleTag>GENERALIZE_TOOL_REFS</RuleTag>
      </>
    ),
    canonicalToTargets: (
      <>
        <TargetLine platform="DALL-E">
          Strictest — never use proper names for historical figures
        </TargetLine>
        <TargetLine platform="Midjourney">
          Most permissive — names generally fine
        </TargetLine>
        <TargetLine platform="Gemini">
          Use descriptive titles, avoid caricature language
        </TargetLine>
      </>
    ),
  },
  {
    aspect: 'Mood vocabulary',
    sourceToCanonical: (
      <>
        <span className="text-gray-400 italic text-xs">Single words preserved</span>
        <br />
        <code className="font-mono text-xs text-gray-700">commanding, defiant, roguish</code>
        <br />
        <RuleTag>PRESERVE</RuleTag>
      </>
    ),
    canonicalToTargets: (
      <>
        <TargetLine platform="DALL-E">
          Single words work fine
        </TargetLine>
        <TargetLine platform="Midjourney">
          <code className="font-mono text-xs text-green-700">authoritative gaze, commanding presence</code>
          <Hint>Expanded to descriptive phrases — MJ needs redundancy</Hint>
        </TargetLine>
        <TargetLine platform="Gemini">
          Single words work fine
        </TargetLine>
      </>
    ),
  },
  {
    aspect: 'Tool references',
    sourceToCanonical: (
      <>
        <code className="font-mono text-xs text-red-500 line-through decoration-red-300">Run: npx tsx style-test.ts</code>
        <br />
        <code className="font-mono text-xs text-green-700">Generate images directly</code>
        <br />
        <RuleTag>GENERALIZE_PATHS</RuleTag>
      </>
    ),
    canonicalToTargets: (
      <>
        <TargetLine platform="DALL-E">
          &quot;Create images using DALL-E&quot; — tool-call awareness
        </TargetLine>
        <TargetLine platform="Midjourney">
          Becomes a reference doc, not an instruction
        </TargetLine>
        <TargetLine platform="Gemini">
          &quot;Use native image generation capability&quot;
        </TargetLine>
      </>
    ),
  },
];

// ─── Image card data ──────────────────────────────────────────────────────────

const RAW_CARDS = [
  {
    platform: 'DALL-E',
    colorClass: 'text-teal-600',
    prompt: 'Illustration of an ancient Roman statesman, simplified graphic sticker style, flat colors, chunky outlines...',
  },
  {
    platform: 'Midjourney',
    colorClass: 'text-purple-600',
    prompt: 'Illustration of an ancient Roman statesman, simplified graphic sticker style, flat colors, chunky outlines...',
  },
  {
    platform: 'Gemini',
    colorClass: 'text-orange-600',
    prompt: 'Illustration of an ancient Roman statesman, simplified graphic sticker style, flat colors, chunky outlines...',
  },
];

const TRANSLATED_CARDS = [
  {
    platform: 'DALL-E',
    colorClass: 'text-teal-600',
    prompt: 'Simplified graphic illustration of an ancient Roman statesman. Flat solid color fills only, hard edges only. Skin: muted yellow-green olive (#6B7F5E)...',
  },
  {
    platform: 'Midjourney',
    colorClass: 'text-purple-600',
    prompt: 'simplified graphic illustration of ancient Roman statesman ::2 rubber stamp screen print aesthetic ::1.5 --no shading shadows --ar 3:4 --style raw...',
  },
  {
    platform: 'Gemini',
    colorClass: 'text-orange-600',
    prompt: 'Illustration of an ancient Roman statesman. NO realistic skin tones. Skin filled with muted yellow-green olive (#6B7F5E). Simplified graphic illustration...',
  },
];

// ─── Small helper components ──────────────────────────────────────────────────

function RuleTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono text-[10px] font-medium bg-gray-100 border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded mt-1">
      {children}
    </span>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] text-gray-400 mt-0.5">{children}</span>;
}

function TargetLine({
  platform,
  children,
}: {
  platform: string;
  children: React.ReactNode;
}) {
  return (
    <p className="text-xs text-gray-700 mb-2 last:mb-0 leading-relaxed">
      <strong className="font-semibold text-gray-900">{platform}:</strong>{' '}
      {children}
    </p>
  );
}

function ImagePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-gray-300">
      <div className="w-8 h-8 border border-dashed border-gray-300 rounded-md" />
      <span className="text-[11px]">awaiting image</span>
    </div>
  );
}

function ImageCard({
  platform,
  colorClass,
  prompt,
  tag,
}: {
  platform: string;
  colorClass: string;
  prompt: string;
  tag: 'raw' | 'translated';
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* 3:4 aspect ratio placeholder */}
      <div className="aspect-[3/4] bg-gray-50 flex items-center justify-center">
        <ImagePlaceholder />
      </div>
      {/* Meta */}
      <div className="px-3.5 py-3 border-t border-gray-100">
        <span
          className={clsx(
            'inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mb-1.5',
            tag === 'raw'
              ? 'bg-red-50 text-red-600'
              : 'bg-green-50 text-green-700'
          )}
        >
          {tag === 'raw' ? 'raw prompt' : 'ronin-translated'}
        </span>
        <p className={clsx('text-xs font-semibold mb-1', colorClass)}>{platform}</p>
        <p className="font-mono text-[10px] text-gray-400 leading-relaxed line-clamp-2">
          {prompt}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TranslationPage() {
  const [view, setView] = useState<ViewMode>('both');

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-3">
          How skill translation works
        </h2>
        <p className="text-base text-gray-500 leading-relaxed max-w-2xl">
          A skill definition written for one platform carries art direction, domain knowledge, and behavioral
          instructions. Ronin extracts the platform-neutral knowledge, then adapts the delivery for each target.
        </p>
      </div>

      {/* Flow diagram */}
      <div className="flex items-center gap-0 mb-12 overflow-x-auto pb-1">
        {/* Step 1 */}
        <FlowStep
          dot={<span className="text-sm font-semibold">1</span>}
          dotClass="bg-red-50 text-red-600 border border-red-200"
          label="Claude Code"
          sub="Source skill"
        />
        <FlowArrow />
        {/* Step 2 */}
        <FlowStep
          dot={<span className="text-sm font-semibold">2</span>}
          dotClass="bg-gray-100 text-gray-500 border border-gray-200"
          label="Canonical"
          sub="Platform-neutral"
        />
        <FlowArrow />
        {/* Branch */}
        <div className="relative pl-5">
          {/* Vertical rule */}
          <div className="absolute left-0 top-5 bottom-5 w-px bg-gray-200" />
          <div className="flex flex-col gap-4">
            <BranchItem
              dotClass="bg-teal-50 text-teal-600 border border-teal-200"
              label="DALL-E"
              sub="Positive framing, hex colors"
              stepLabel="3a"
            />
            <BranchItem
              dotClass="bg-purple-50 text-purple-600 border border-purple-200"
              label="Midjourney"
              sub="Weighted keywords, --params"
              stepLabel="3b"
            />
            <BranchItem
              dotClass="bg-orange-50 text-orange-600 border border-orange-200"
              label="Gemini"
              sub="Native image gen, inline negatives"
              stepLabel="3c"
            />
          </div>
        </div>
      </div>

      {/* What changes table */}
      <div className="mb-10">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">What changes at each stage</h3>
        <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-200">
          {/* Header row */}
          <div className="grid grid-cols-[160px_1fr_1fr] divide-x divide-gray-200 bg-gray-50">
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Aspect</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Source → Canonical</div>
            <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Canonical → Targets</div>
          </div>
          {/* Data rows */}
          {TABLE_ROWS.map((row) => (
            <div key={row.aspect} className="grid grid-cols-[160px_1fr_1fr] divide-x divide-gray-200">
              <div className="px-4 py-3.5 bg-gray-50 text-xs font-semibold text-gray-600 flex items-start pt-3.5">
                {row.aspect}
              </div>
              <div className="px-4 py-3.5 text-xs text-gray-700 leading-relaxed">
                {row.sourceToCanonical}
              </div>
              <div className="px-4 py-3.5 leading-relaxed">
                {row.canonicalToTargets}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison grid */}
      <div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-5">
          <h3 className="text-sm font-semibold text-gray-700">Same subject, three models</h3>
          {/* Toggle pills */}
          <div className="flex gap-0.5 bg-gray-100 border border-gray-200 rounded-lg p-0.5">
            {(
              [
                { mode: 'raw', label: 'Without Ronin' },
                { mode: 'translated', label: 'With Ronin' },
                { mode: 'both', label: 'Side by side' },
              ] as { mode: ViewMode; label: string }[]
            ).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={clsx(
                  'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all',
                  view === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Raw row */}
        {(view === 'raw' || view === 'both') && (
          <div className="mb-5">
            <p className="text-[11px] font-medium text-gray-400 mb-3 tracking-wide">
              Same raw prompt sent to all three — each model interprets differently
            </p>
            <div className="grid grid-cols-3 gap-4">
              {RAW_CARDS.map((card) => (
                <ImageCard key={card.platform} {...card} tag="raw" />
              ))}
            </div>
          </div>
        )}

        {/* Translated row */}
        {(view === 'translated' || view === 'both') && (
          <div className="mb-5">
            <p className="text-[11px] font-medium text-gray-400 mb-3 tracking-wide">
              Platform-optimized from one skill definition — consistent output
            </p>
            <div className="grid grid-cols-3 gap-4">
              {TRANSLATED_CARDS.map((card) => (
                <ImageCard key={card.platform} {...card} tag="translated" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-10 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-400 leading-relaxed mb-4">
          The art direction knowledge — palettes, moods, style references, composition — transfers at near-100%
          fidelity across all platforms. What changes is the delivery: how that knowledge is expressed in a form
          each model can act on. The translation rules are codified and mostly mechanical; the knowledge itself
          is written once.
        </p>
        <code className="font-mono text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg block w-fit">
          ronin translate illustrator --to dalle midjourney gemini
        </code>
      </div>
    </div>
  );
}

// ─── Flow helpers ─────────────────────────────────────────────────────────────

function FlowStep({
  dot,
  dotClass,
  label,
  sub,
}: {
  dot: React.ReactNode;
  dotClass: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
      <div className={clsx('w-10 h-10 rounded-full flex items-center justify-center', dotClass)}>
        {dot}
      </div>
      <span className="text-xs font-semibold text-gray-600 text-center">{label}</span>
      <span className="text-[11px] text-gray-400 text-center">{sub}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="shrink-0 w-8 text-center text-gray-300 text-lg select-none">→</div>
  );
}

function BranchItem({
  dotClass,
  label,
  sub,
  stepLabel,
}: {
  dotClass: string;
  label: string;
  sub: string;
  stepLabel: string;
}) {
  return (
    <div className="relative flex items-center gap-2.5">
      {/* Horizontal connector line from vertical rule */}
      <div className="absolute -left-5 w-5 h-px bg-gray-200" />
      <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0', dotClass)}>
        {stepLabel}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-600">{label}</p>
        <p className="text-[11px] text-gray-400">{sub}</p>
      </div>
    </div>
  );
}
