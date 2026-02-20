import type { TargetAdapter, TargetRuleName, TargetResult, CanonicalResult, SkillMetadata } from './types.js';

// Negation → positive rephrasing lookup
const NEGATIVE_INVERSIONS: [RegExp, string][] = [
  [/\bNO shading\b/gi, 'flat solid fills only'],
  [/\bno shading\b/gi, 'flat solid fills only'],
  [/\bNO shadows\b/gi, 'shadowless, even lighting'],
  [/\bno shadows\b/gi, 'shadowless, even lighting'],
  [/\bNO gradients?\b/gi, 'uniform flat color per shape'],
  [/\bno gradients?\b/gi, 'uniform flat color per shape'],
  [/\bNO texture\b/gi, 'smooth solid surfaces'],
  [/\bno texture\b/gi, 'smooth solid surfaces'],
  [/\bNO text\b/gi, 'image without any text elements'],
  [/\bno text\b/gi, 'image without any text elements'],
  [/\bNO labels?\b/gi, 'without any labels'],
  [/\bno labels?\b/gi, 'without any labels'],
  [/\bNO watermarks?\b/gi, 'without watermarks'],
  [/\bno watermarks?\b/gi, 'without watermarks'],
  [/\bNO drop.?shadow\b/gi, 'without drop shadow effects'],
  [/\bno drop.?shadow\b/gi, 'without drop shadow effects'],
  [/\bNO crosshatching\b/gi, 'clean flat fills without crosshatching'],
  [/\bno crosshatching\b/gi, 'clean flat fills without crosshatching'],
  [/\bNO halftone\b/gi, 'solid fills without halftone patterns'],
  [/\bno halftone\b/gi, 'solid fills without halftone patterns'],
  [/\bNOT photorealistic\b/gi, 'stylized graphic illustration'],
  [/\bnot photorealistic\b/gi, 'stylized graphic illustration'],
];

// Hex code → English name mapping
const HEX_NAMES: [RegExp, string][] = [
  [/#6B7F5E/g, '#6B7F5E (muted olive green)'],
  [/#8B2635/g, '#8B2635 (dark burgundy)'],
  [/#2A2A2A/g, '#2A2A2A (dark charcoal)'],
  [/#FEFEFE/g, '#FEFEFE (cream white)'],
  [/#FFD700/g, '#FFD700 (gold)'],
  [/#1E3A5F/g, '#1E3A5F (deep navy)'],
  [/#C0392B/g, '#C0392B (crimson red)'],
  [/#2E8B57/g, '#2E8B57 (sea green)'],
];

const REAL_PERSON_PATTERNS = [
  /\b(Caesar|Augustus|Nero|Cleopatra|Alexander|Napoleon|Lincoln|Churchill|Trump|Obama)\b/gi,
  /\b(portrait of|likeness of|photo of)\s+(a\s+)?(real|actual|specific)\b/gi,
];

function rephraseNegatives(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  let result = content;
  let applied = false;
  const reviewItems: string[] = [];

  for (const [pattern, replacement] of NEGATIVE_INVERSIONS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) applied = true;
  }

  // Flag remaining negatives we couldn't auto-convert
  const remainingNegatives = result.match(/\b(?:NO|no|not|never|don't|avoid)\s+\w+/g);
  if (remainingNegatives) {
    const unique = [...new Set(remainingNegatives)];
    if (unique.length > 0) {
      reviewItems.push(
        `Remaining negatives that may not work well with DALL-E: ${unique.slice(0, 5).join(', ')}. ` +
        `Consider rephrasing as positive instructions.`
      );
    }
  }

  return { content: result, applied, reviewItems };
}

function addPlatformConstraints(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  const constraints = [
    '',
    '---',
    '## DALL-E Platform Notes',
    '- Supported sizes: 1024x1024, 1024x1792, 1792x1024',
    '- DALL-E works best with positive descriptions rather than negations',
    '- Each prompt should be self-contained (no multi-turn context)',
    '- Content policy: no real person likenesses, violence, or hateful content',
  ];

  return {
    content: content + '\n' + constraints.join('\n'),
    applied: true,
    reviewItems: [],
  };
}

function adaptColorHandling(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  let result = content;
  let applied = false;

  for (const [pattern, replacement] of HEX_NAMES) {
    // Only add name if not already annotated
    const before = result;
    result = result.replace(pattern, (match) => {
      // Check if already has a description in parens after it
      const idx = result.indexOf(match);
      const after = result.slice(idx + match.length, idx + match.length + 3);
      if (after.startsWith(' (')) return match; // already annotated
      return replacement;
    });
    if (result !== before) applied = true;
  }

  return { content: result, applied, reviewItems: [] };
}

function adaptSafetyPolicy(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  const reviewItems: string[] = [];
  let applied = false;

  for (const pattern of REAL_PERSON_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      reviewItems.push(
        `Real person reference detected: ${[...new Set(matches)].join(', ')}. ` +
        `DALL-E will refuse to generate likenesses of real people. Use generic descriptions.`
      );
      applied = true;
    }
  }

  return { content, applied, reviewItems };
}

export const dalleAdapter: TargetAdapter = {
  name: 'dalle',
  displayName: 'DALL-E',

  transform(canonical: CanonicalResult, metadata: SkillMetadata): TargetResult {
    const rulesApplied: TargetRuleName[] = [];
    const reviewItems: string[] = [];
    let content = canonical.markdown;

    // Add header
    content = `# ${metadata.name} — DALL-E Prompt Guide\n\n${content}`;

    // Rephrase negatives
    const neg = rephraseNegatives(content);
    content = neg.content;
    if (neg.applied) rulesApplied.push('REPHRASE_NEGATIVES');
    reviewItems.push(...neg.reviewItems);

    // Color handling
    const color = adaptColorHandling(content);
    content = color.content;
    if (color.applied) rulesApplied.push('ADAPT_COLOR_HANDLING');
    reviewItems.push(...color.reviewItems);

    // Safety policy
    const safety = adaptSafetyPolicy(content);
    content = safety.content;
    if (safety.applied) rulesApplied.push('ADAPT_SAFETY_POLICY');
    reviewItems.push(...safety.reviewItems);

    // Platform constraints
    const constraints = addPlatformConstraints(content);
    content = constraints.content;
    if (constraints.applied) rulesApplied.push('ADD_PLATFORM_CONSTRAINTS');
    reviewItems.push(...constraints.reviewItems);

    return {
      markdown: content,
      rulesApplied,
      reviewItems,
      fidelity: 60,
    };
  },
};
