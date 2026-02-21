'use client';

// ─── Source skill excerpt (denuded of Gemini-specific language) ──────────────

const SKILL_EXCERPT = `# Illustrator — Art Direction Skill

You are an illustration art director. Generate images
that match a locked-in house style.

### House Style: Simplified Graphic Sticker

**Aesthetic**: Simplified graphic illustration — bold flat
shapes, chunky outlines, like a rubber stamp or screen
print. Die-cut vinyl sticker feel.

**Key visual elements**:
- Bold flat color shapes with thick chunky dark charcoal
  (#2A2A2A) outlines
- Minimal facial detail — simple lines for features,
  NOT photorealistic
- NO shading, NO shadows, NO gradients, NO texture
- Every shape is a single flat solid color with hard edges
- Die-cut sticker: thick white border following silhouette,
  floating on solid cream (#FEFEFE) background
- Non-realistic skin tones: palette-derived (olive, amber,
  slate, terracotta, sage, ochre)

**Six two-color palettes** (assigned per figure):
1. Burgundy & Olive — Skin: #6B7F5E, Accent: #8B2635
2. Indigo & Amber — Skin: #C4922A, Accent: #2C3E6B
3. Sienna & Slate — Skin: #5E7B8A, Accent: #A0522D
...

**Mood system**: commanding, defiant, scheming, solemn,
dignified, wise, roguish, stoic, fierce, composed

**Figure portraits**: Head and upper body,
period-appropriate details.

**Safety**: Avoid naming specific historical figures
directly in prompts — use descriptive titles instead.
Image generation may block prompts with named figures
+ caricature language.`;

// ─── Prompt data ─────────────────────────────────────────────────────────────

const RAW_PROMPT =
  'Illustration of an ancient Roman statesman, simplified graphic sticker style, flat colors, chunky outlines, die-cut with white border on cream background, non-realistic olive green skin tone, dark burgundy clothing, commanding expression, head and upper body, no text';

// ─── Annotation types ────────────────────────────────────────────────────────

type Annotation = {
  label: string;
  color: string;
  textColor: string;
};

const ANNOTATIONS: Record<string, Annotation> = {
  palette: {
    label: 'Palette injected',
    color: 'bg-emerald-100',
    textColor: 'text-emerald-800',
  },
  style: {
    label: 'Style locked',
    color: 'bg-purple-100',
    textColor: 'text-purple-800',
  },
  negatives: {
    label: 'Negatives adapted',
    color: 'bg-amber-100',
    textColor: 'text-amber-800',
  },
  composition: {
    label: 'Composition specified',
    color: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
};

function Badge({ annotation }: { annotation: Annotation }) {
  return (
    <span
      className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${annotation.color} ${annotation.textColor}`}
    >
      {annotation.label}
    </span>
  );
}

// ─── Annotated prompt renderer ───────────────────────────────────────────────

type AnnotatedSegment = {
  text: string;
  annotation?: keyof typeof ANNOTATIONS;
};

function AnnotatedPrompt({
  segments,
  platform,
  platformColor,
}: {
  segments: AnnotatedSegment[];
  platform: string;
  platformColor: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-semibold mb-3 ${platformColor}`}>{platform}</p>
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 font-mono text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
        {segments.map((seg, i) => {
          if (!seg.annotation) {
            return <span key={i}>{seg.text}</span>;
          }
          const ann = ANNOTATIONS[seg.annotation];
          return (
            <span key={i}>
              <Badge annotation={ann} />
              {' '}
              <span className={`${ann.textColor} font-medium`}>{seg.text}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Prompt segments with annotations ────────────────────────────────────────

const DALLE_SEGMENTS: AnnotatedSegment[] = [
  { text: 'Simplified graphic illustration of an ancient Roman statesman from the late Roman Republic. Head and upper body portrait. Authoritative, commanding expression. Period-appropriate laurel wreath, draped toga at neckline.\n\n' },
  { text: 'Flat solid color fills only, hard edges only.', annotation: 'negatives' },
  { text: ' ' },
  { text: 'Skin and face: muted yellow-green olive (#6B7F5E). Clothing and accessories: dark red-brown burgundy (#8B2635). Thick dark charcoal (#2A2A2A) outlines.', annotation: 'palette' },
  { text: ' ' },
  { text: 'Rubber stamp / screen print aesthetic. Single flat color per shape. Minimal facial detail, simple lines for features.', annotation: 'style' },
  { text: '\n\n' },
  { text: 'Die-cut sticker with thick white border following silhouette on plain cream (#FEFEFE) background. Sticker floats freely within the frame, never touches edges.', annotation: 'composition' },
  { text: ' No drop shadow. No text, no labels, no watermarks.' },
];

const GEMINI_SEGMENTS: AnnotatedSegment[] = [
  { text: 'Illustration of an ancient Roman statesman from the late Roman Republic. Head and upper body. Commanding expression. Period-appropriate details: laurel wreath, draped toga at neckline.\n\n' },
  { text: 'NO realistic skin tones.', annotation: 'negatives' },
  { text: ' ' },
  { text: 'Skin and face filled with muted yellow-green olive (#6B7F5E). Clothing and accessories filled with dark red-brown burgundy (#8B2635). Charcoal (#2A2A2A) outlines.', annotation: 'palette' },
  { text: '\n\n' },
  { text: 'Simplified graphic illustration style. Bold flat color shapes with thick chunky dark charcoal outlines, like a rubber stamp or screen print. Minimal facial detail — simple lines for features, NOT photorealistic.', annotation: 'style' },
  { text: ' ' },
  { text: 'NO shading, NO shadows, NO gradients, NO texture in hair. Every shape is a single flat color with hard edges. No crosshatching, no halftone dots. Flat solid color fills only.', annotation: 'negatives' },
  { text: ' ' },
  { text: 'Die-cut sticker with thick white border following silhouette. Plain solid cream (#FEFEFE) background. Sticker floats freely within the frame, never touches edges.', annotation: 'composition' },
  { text: ' No drop shadow. No text, no labels, no watermarks.' },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TranslationPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">

      {/* ── Act 1: The Problem ────────────────────────────────────── */}
      <section className="mb-16">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">
          Without skill injection, models diverge
        </h1>
        <p className="text-sm text-gray-500 mb-6 max-w-2xl">
          The exact same prompt sent to two models. Each makes its own choices about palette, style, and composition.
        </p>

        {/* Raw prompt */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
            Prompt (identical to both models)
          </p>
          <p className="font-mono text-xs text-gray-700 leading-relaxed">
            {RAW_PROMPT}
          </p>
        </div>

        {/* Raw images side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-600 mb-2">DALL-E</p>
            <div className="aspect-[3/4] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <img
                src="/translation-test-images/raw-dalle.png"
                alt="Raw DALL-E output"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-orange-600 mb-2">Gemini</p>
            <div className="aspect-[3/4] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <img
                src="/translation-test-images/raw-gemini.png"
                alt="Raw Gemini output"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Act 2: The Skill Injection ────────────────────────────── */}
      <section className="mb-16">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">
          Ronin injects your skill into each prompt
        </h1>
        <p className="text-sm text-gray-500 mb-4 max-w-2xl">
          An illustrator skill written for Claude Code defines palette, style, composition, and constraints.{' '}
          <code className="font-mono text-xs bg-gray-100 text-gray-600 px-1 py-0.5 rounded">
            ronin translate
          </code>{' '}
          reads it, strips platform-specific references, and generates a tailored prompt for each target
          model — adapting structure and syntax while preserving the creative intent.
        </p>

        {/* Source skill */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-gray-700">Claude Code skill</p>
            <span className="text-[10px] font-mono text-gray-400">~/.claude/skills/illustrator/SKILL.md</span>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap overflow-x-auto max-h-72 overflow-y-auto">
            {SKILL_EXCERPT}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Platform-neutral art direction. Defines the visual language — not how to talk to any specific model.
          </p>
        </div>

        {/* Annotation legend */}
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.values(ANNOTATIONS).map((ann) => (
            <Badge key={ann.label} annotation={ann} />
          ))}
        </div>

        {/* Side-by-side annotated prompts */}
        <div className="flex gap-4">
          <AnnotatedPrompt
            segments={DALLE_SEGMENTS}
            platform="DALL-E"
            platformColor="text-teal-600"
          />
          <AnnotatedPrompt
            segments={GEMINI_SEGMENTS}
            platform="Gemini"
            platformColor="text-orange-600"
          />
        </div>

        {/* Quick callouts */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="text-[11px] text-gray-500 leading-relaxed space-y-1">
            <p><span className="font-semibold text-amber-700">Negatives adapted:</span> DALL-E gets positive framing — "hard edges only" instead of "NO shading"</p>
            <p><span className="font-semibold text-emerald-700">Palette injected:</span> hex codes + English names for reliable color matching</p>
          </div>
          <div className="text-[11px] text-gray-500 leading-relaxed space-y-1">
            <p><span className="font-semibold text-amber-700">Negatives adapted:</span> Gemini keeps explicit inline negatives — "NO shading, NO shadows"</p>
            <p><span className="font-semibold text-purple-700">Style locked:</span> rubber stamp / screen print with flat solid fills</p>
          </div>
        </div>
      </section>

      {/* ── Act 3: The Result ─────────────────────────────────────── */}
      <section className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">
          Same skill, consistent output
        </h1>
        <p className="text-sm text-gray-500 mb-6 max-w-2xl">
          Both images came from the same skill definition. The palette, style, and composition match — despite being generated by different models.
        </p>

        {/* Translated images side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-600 mb-2">DALL-E</p>
            <div className="aspect-[3/4] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <img
                src="/translation-test-images/ronin-dalle.png"
                alt="Ronin-translated DALL-E output"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-orange-600 mb-2">Gemini</p>
            <div className="aspect-[3/4] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
              <img
                src="/translation-test-images/ronin-gemini.png"
                alt="Ronin-translated Gemini output"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div className="pt-6 border-t border-gray-200">
        <code className="font-mono text-xs bg-gray-100 text-gray-600 px-3 py-2 rounded-lg block w-fit mb-3">
          ronin translate illustrator --to dalle gemini
        </code>
        <p className="text-sm text-gray-400">
          The skill is written once. The delivery is adapted mechanically.
        </p>
      </div>
    </div>
  );
}
