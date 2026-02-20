export type TargetPlatform = 'dalle' | 'midjourney' | 'gemini';

export type CanonicalRuleName =
  | 'PLATFORM_LOCKED'
  | 'STRIP_FRONTMATTER'
  | 'STRIP_DISPATCH_EXAMPLES'
  | 'GENERALIZE_TOOL_REFS'
  | 'GENERALIZE_PATHS'
  | 'FLATTEN_ESCALATION'
  | 'ENHANCE_NATIVE_CAPABILITY'
  | 'PRESERVE_MARKDOWN'
  | 'PRESERVE_CODE_EXAMPLES';

export type TargetRuleName =
  | 'REPHRASE_NEGATIVES'
  | 'REFORMAT_PROMPT_SYNTAX'
  | 'ADD_PLATFORM_CONSTRAINTS'
  | 'ADD_PLATFORM_SYNTAX'
  | 'ADAPT_COLOR_HANDLING'
  | 'ADAPT_SAFETY_POLICY'
  | 'ENHANCE_NATIVE_CAPABILITY'
  | 'TRANSLATE_VOCABULARY'
  | 'REPLACE_INTERACTION_MODEL'
  | 'REFORMAT_AS_REFERENCE';

export interface RuleResult {
  content: string;
  applied: boolean;
  reviewItems: string[];
}

export interface SkillMetadata {
  id: string;
  name: string;
  purpose: string;
  sourceFile: string;
  platform: string;
}

export interface CanonicalResult {
  markdown: string;
  rulesApplied: CanonicalRuleName[];
  reviewItems: string[];
  isPlatformLocked: boolean;
}

export interface TargetResult {
  markdown: string;
  rulesApplied: TargetRuleName[];
  reviewItems: string[];
  fidelity: number; // 0-100 estimated automation fidelity
}

export interface TargetAdapter {
  name: TargetPlatform;
  displayName: string;
  transform(canonical: CanonicalResult, metadata: SkillMetadata): TargetResult;
}

export interface TranslationManifest {
  source: {
    passportId: string;
    name: string;
    sourceFile: string;
    platform: string;
  };
  canonical: {
    file: string;
    rulesApplied: CanonicalRuleName[];
    reviewItems: string[];
    isPlatformLocked: boolean;
  };
  targets: Record<TargetPlatform, {
    file: string;
    rulesApplied: TargetRuleName[];
    reviewItems: string[];
    fidelity: number;
  }>;
  translatedAt: string;
}
