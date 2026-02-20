import type { TargetAdapter, TargetRuleName, TargetResult, CanonicalResult, SkillMetadata } from './types.js';

// Vocabulary expansion: terse adjective → more descriptive MJ-friendly phrasing
const VOCABULARY_EXPANSIONS: [RegExp, string][] = [
  [/\bcommanding\b/gi, 'authoritative gaze, commanding presence'],
  [/\bstoic\b/gi, 'stoic calm, unwavering composure'],
  [/\bmelancholic\b/gi, 'melancholic wistfulness, pensive sorrow'],
  [/\bplayful\b/gi, 'playful whimsy, lighthearted charm'],
  [/\bserene\b/gi, 'serene tranquility, peaceful stillness'],
  [/\bfierce\b/gi, 'fierce intensity, burning determination'],
  [/\belegant\b/gi, 'elegant refinement, graceful poise'],
  [/\bmysterious\b/gi, 'enigmatic mystery, shadowed allure'],
  [/\bbrooding\b/gi, 'brooding intensity, dark contemplation'],
  [/\btriumphant\b/gi, 'triumphant glory, victorious pride'],
  [/\bweary\b/gi, 'world-weary exhaustion, tired wisdom'],
  [/\bdefiant\b/gi, 'defiant resolve, unyielding stance'],
  [/\bcontemplative\b/gi, 'deep contemplation, philosophical gaze'],
  [/\bregal\b/gi, 'regal bearing, royal dignity'],
  [/\bwise\b/gi, 'sage wisdom, knowing intelligence'],
  [/\bsimplified\b/gi, 'clean minimal'],
  [/\bbold\b/gi, 'striking bold'],
  [/\bchunky\b/gi, 'thick heavy'],
  [/\bmuted\b/gi, 'desaturated muted'],
  [/\bflat\b/gi, 'solid flat'],
];

// Extract negatives for --no flag
function extractNegatives(content: string): string[] {
  const negatives: string[] = [];
  const patterns = [
    /\bNO\s+(\w[\w\s]*?)(?=[.,;]|$)/gm,
    /\bno\s+(\w[\w\s]*?)(?=[.,;]|$)/gm,
    /\bwithout\s+(\w[\w\s]*?)(?=[.,;]|$)/gm,
    /\bNOT\s+(\w[\w\s]*?)(?=[.,;]|$)/gm,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const term = match[1].trim().toLowerCase();
      if (term.length > 2 && term.length < 30) {
        negatives.push(term);
      }
    }
  }

  return [...new Set(negatives)];
}

function reformatPromptSyntax(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  const reviewItems: string[] = [];

  // Split content into sections by headers
  const sections = content.split(/^(#+\s+.+)$/m);
  const weighted: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      weighted.push(trimmed);
    } else {
      // Convert paragraph blocks to weighted keyword phrases
      const sentences = trimmed.split(/[.!]\s+/).filter(s => s.trim().length > 10);
      if (sentences.length > 0) {
        weighted.push(trimmed);
      }
    }
  }

  reviewItems.push(
    'Midjourney prompt syntax conversion is approximate. Review the entire output for proper ::weight distribution.'
  );

  return {
    content: weighted.join('\n\n'),
    applied: true,
    reviewItems,
  };
}

function addPlatformSyntax(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  const negatives = extractNegatives(content);

  const params: string[] = [];
  if (negatives.length > 0) {
    params.push(`--no ${negatives.join(' ')}`);
  }
  params.push('--ar 3:4');
  params.push('--style raw');
  params.push('--stylize 200');
  params.push('--v 7');

  const paramBlock = [
    '',
    '---',
    '## Midjourney Parameters',
    '```',
    params.join(' '),
    '```',
    '',
    '### Suggested Adjustments',
    '- Aspect ratio: `--ar 3:4` (portrait), `--ar 4:3` (landscape), `--ar 1:1` (square)',
    '- Stylize: `--stylize 0` (literal) to `--stylize 1000` (artistic). 200 is moderate.',
    '- Consider `--sref <URL>` for style reference images',
    '- Consider `--cref <URL>` for character reference consistency',
  ];

  return {
    content: content + '\n' + paramBlock.join('\n'),
    applied: true,
    reviewItems: [],
  };
}

function translateVocabulary(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  let result = content;
  let applied = false;

  for (const [pattern, replacement] of VOCABULARY_EXPANSIONS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) applied = true;
  }

  return { content: result, applied, reviewItems: [] };
}

function adaptColorHandling(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  let result = content;
  let applied = false;
  const reviewItems: string[] = [];

  // Strip hex codes, keep English color names
  const hexPattern = /#[0-9A-Fa-f]{6}/g;
  const hexMatches = content.match(hexPattern);
  if (hexMatches) {
    // Remove hex codes but keep surrounding context
    result = result.replace(/\s*#[0-9A-Fa-f]{6}\s*/g, ' ');
    applied = true;
    reviewItems.push(
      `Removed ${hexMatches.length} hex color codes. Midjourney works better with English color names. Consider using --sref for precise color matching.`
    );
  }

  return { content: result, applied, reviewItems };
}

function replaceInteractionModel(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  let result = content;
  let applied = false;

  // Remove conversational framing
  const conversational: [RegExp, string][] = [
    [/\bwhen the user asks?\b/gi, 'for'],
    [/\bask the user\b/gi, 'determine'],
    [/\bthe user should\b/gi, ''],
    [/\bif the user\b/gi, 'if'],
    [/\byou should respond\b/gi, 'output'],
    [/\byour response should\b/gi, 'output should'],
    [/\brespond with\b/gi, 'produce'],
  ];

  for (const [pattern, replacement] of conversational) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) applied = true;
  }

  return { content: result, applied, reviewItems: [] };
}

function reformatAsReference(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  // Wrap in reference document framing
  const lines = [
    '> This is a reference document for crafting Midjourney prompts, not a system prompt.',
    '> Extract relevant keywords and structure them using ::weight syntax.',
    '',
    content,
  ];

  return {
    content: lines.join('\n'),
    applied: true,
    reviewItems: ['Reformatted as reference document. Midjourney has no system prompt — use this as a guide when writing prompts.'],
  };
}

export const midjourneyAdapter: TargetAdapter = {
  name: 'midjourney',
  displayName: 'Midjourney',

  transform(canonical: CanonicalResult, metadata: SkillMetadata): TargetResult {
    const rulesApplied: TargetRuleName[] = [];
    const reviewItems: string[] = [];
    let content = canonical.markdown;

    // Add header
    content = `# ${metadata.name} — Midjourney Reference\n\n${content}`;

    // Reformat prompt syntax
    const syntax = reformatPromptSyntax(content);
    content = syntax.content;
    if (syntax.applied) rulesApplied.push('REFORMAT_PROMPT_SYNTAX');
    reviewItems.push(...syntax.reviewItems);

    // Translate vocabulary
    const vocab = translateVocabulary(content);
    content = vocab.content;
    if (vocab.applied) rulesApplied.push('TRANSLATE_VOCABULARY');
    reviewItems.push(...vocab.reviewItems);

    // Color handling
    const color = adaptColorHandling(content);
    content = color.content;
    if (color.applied) rulesApplied.push('ADAPT_COLOR_HANDLING');
    reviewItems.push(...color.reviewItems);

    // Replace interaction model
    const interaction = replaceInteractionModel(content);
    content = interaction.content;
    if (interaction.applied) rulesApplied.push('REPLACE_INTERACTION_MODEL');
    reviewItems.push(...interaction.reviewItems);

    // Platform syntax (--no, --ar, etc.)
    const platSyntax = addPlatformSyntax(content);
    content = platSyntax.content;
    if (platSyntax.applied) rulesApplied.push('ADD_PLATFORM_SYNTAX');
    reviewItems.push(...platSyntax.reviewItems);

    // Reformat as reference doc
    const ref = reformatAsReference(content);
    content = ref.content;
    if (ref.applied) rulesApplied.push('REFORMAT_AS_REFERENCE');
    reviewItems.push(...ref.reviewItems);

    return {
      markdown: content,
      rulesApplied,
      reviewItems,
      fidelity: 30,
    };
  },
};
