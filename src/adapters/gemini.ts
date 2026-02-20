import type { TargetAdapter, TargetRuleName, TargetResult, CanonicalResult, SkillMetadata } from './types.js';

// Proper names that may trigger Gemini's image generation safety filters
const HISTORICAL_FIGURE_PATTERNS = [
  /\b(Caesar|Augustus|Nero|Cleopatra|Alexander|Napoleon|Lincoln|Churchill)\b/gi,
  /\b(real person|historical figure|famous)\b/gi,
];

function adaptSafetyPolicy(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  const reviewItems: string[] = [];
  let applied = false;

  for (const pattern of HISTORICAL_FIGURE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      reviewItems.push(
        `Historical proper name(s) detected: ${[...new Set(matches)].join(', ')}. ` +
        `Gemini may refuse image generation for real historical figures. Consider using generic descriptions.`
      );
      applied = true;
    }
  }

  return { content, applied, reviewItems };
}

function enhanceNativeCapability(content: string): { content: string; applied: boolean; reviewItems: string[] } {
  const reviewItems: string[] = [];
  let applied = false;

  // Note Gemini's native image generation
  if (/\b(image|illustration|visual|picture|drawing|artwork)\b/i.test(content)) {
    reviewItems.push('Gemini can generate images directly via its native API. No external image tool needed.');
    applied = true;
  }

  return { content, applied, reviewItems };
}

export const geminiAdapter: TargetAdapter = {
  name: 'gemini',
  displayName: 'Gemini',

  transform(canonical: CanonicalResult, metadata: SkillMetadata): TargetResult {
    const rulesApplied: TargetRuleName[] = [];
    const reviewItems: string[] = [];
    let content = canonical.markdown;

    // Add Gemini system instruction header
    content = `# ${metadata.name} — Gemini System Instruction\n\n${content}`;

    // Safety policy
    const safety = adaptSafetyPolicy(content);
    content = safety.content;
    if (safety.applied) rulesApplied.push('ADAPT_SAFETY_POLICY');
    reviewItems.push(...safety.reviewItems);

    // Native capability
    const native = enhanceNativeCapability(content);
    content = native.content;
    if (native.applied) rulesApplied.push('ENHANCE_NATIVE_CAPABILITY');
    reviewItems.push(...native.reviewItems);

    return {
      markdown: content,
      rulesApplied,
      reviewItems,
      fidelity: 80,
    };
  },
};
