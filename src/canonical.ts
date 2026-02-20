import matter from 'gray-matter';
import type { CanonicalRuleName, CanonicalResult, RuleResult, SkillMetadata } from './adapters/types.js';

type CanonicalRule = (content: string, metadata: SkillMetadata) => RuleResult;

const TOOL_REFS: [RegExp, string][] = [
  [/\bRead tool\b/gi, 'file reading'],
  [/\bWrite tool\b/gi, 'file writing'],
  [/\bEdit tool\b/gi, 'file editing'],
  [/\bBash tool\b/gi, 'command execution'],
  [/\bGlob tool\b/gi, 'file search'],
  [/\bGrep tool\b/gi, 'content search'],
  [/\bTask tool\b/gi, 'agent delegation'],
  [/\bWebFetch tool\b/gi, 'web fetching'],
  [/\bWebSearch tool\b/gi, 'web search'],
  [/\bNotebookEdit tool\b/gi, 'notebook editing'],
  [/\bAskUserQuestion tool\b/gi, 'user prompting'],
];

const PLATFORM_TOOL_PATTERNS = [
  /\bRead tool\b/i, /\bWrite tool\b/i, /\bEdit tool\b/i, /\bBash tool\b/i,
  /\bGlob tool\b/i, /\bGrep tool\b/i, /\bTask tool\b/i, /\bWebFetch tool\b/i,
  /\bNotebookEdit tool\b/i, /\bAskUserQuestion\b/i, /\bSkill tool\b/i,
  /\bEnterPlanMode\b/i, /\bExitPlanMode\b/i, /\bToolSearch\b/i,
  /subagent_type\s*=/i, /\bantml:invoke\b/i, /\bantml:parameter\b/i,
];

const platformLocked: CanonicalRule = (content, _meta) => {
  const lines = content.split('\n');
  let toolLines = 0;
  for (const line of lines) {
    if (PLATFORM_TOOL_PATTERNS.some(p => p.test(line))) {
      toolLines++;
    }
  }
  const ratio = lines.length > 0 ? toolLines / lines.length : 0;
  const locked = ratio > 0.5;
  return {
    content,
    applied: true,
    reviewItems: locked
      ? [`Platform-locked: ${Math.round(ratio * 100)}% of lines reference platform-specific tools. Translation will be lossy.`]
      : [],
  };
};

const stripFrontmatter: CanonicalRule = (content) => {
  const parsed = matter(content);
  const stripped = parsed.content.trim();
  return {
    content: stripped,
    applied: stripped !== content.trim(),
    reviewItems: [],
  };
};

const stripDispatchExamples: CanonicalRule = (content) => {
  const cleaned = content
    .replace(/<example>[\s\S]*?<\/example>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    content: cleaned,
    applied: cleaned !== content,
    reviewItems: [],
  };
};

const generalizeToolRefs: CanonicalRule = (content) => {
  let result = content;
  let applied = false;
  for (const [pattern, replacement] of TOOL_REFS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) applied = true;
  }
  return { content: result, applied, reviewItems: [] };
};

const generalizePaths: CanonicalRule = (content) => {
  let result = content;
  let applied = false;
  const before = result;

  // Absolute home paths
  result = result.replace(/\/Users\/[^\s,)'"]+/g, '<local-path>');
  result = result.replace(/\/home\/[^\s,)'"]+/g, '<local-path>');
  // Tilde paths
  result = result.replace(/~\/[^\s,)'"]+/g, '<local-path>');

  if (result !== before) applied = true;

  return { content: result, applied, reviewItems: [] };
};

const flattenEscalation: CanonicalRule = (content) => {
  const reviewItems: string[] = [];
  let result = content;
  let applied = false;

  const simple: [RegExp, string][] = [
    [/\bdispatch to the (\w[\w-]*) agent\b/gi, 'consider consulting a $1 specialist'],
    [/\bhand off to\b/gi, 'the user should review with'],
    [/\bescalate to\b/gi, 'consider consulting'],
    [/\blaunch the (\w[\w-]*) agent\b/gi, 'consider consulting a $1 specialist'],
    [/\buse the Task tool to\b/gi, 'consider having a specialist'],
  ];

  for (const [pattern, replacement] of simple) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) applied = true;
  }

  // Flag complex multi-agent orchestration
  const orchestrationPatterns = /\b(parallel.*agent|concurrent.*agent|multiple.*subagent)/gi;
  const matches = content.match(orchestrationPatterns);
  if (matches) {
    reviewItems.push(`Complex orchestration found: "${matches[0]}". Review for target platform compatibility.`);
  }

  return { content: result, applied, reviewItems };
};

const enhanceNativeCapability: CanonicalRule = (content) => {
  const reviewItems: string[] = [];

  // Detect external API patterns
  const apiPatterns = [
    { pattern: /\bfetch\s*\(/gi, label: 'fetch() API calls' },
    { pattern: /\bexecSync\b/gi, label: 'shell execution' },
    { pattern: /\bchild_process\b/gi, label: 'child process spawning' },
    { pattern: /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/gi, label: 'Node.js require()' },
    { pattern: /\bimport\s+.*from\s+['"][^'"]+['"]/gi, label: 'ES module imports' },
  ];

  for (const { pattern, label } of apiPatterns) {
    if (pattern.test(content)) {
      reviewItems.push(`External capability detected: ${label}. Target platform may handle this differently.`);
    }
  }

  return { content, applied: false, reviewItems };
};

const preserveMarkdown: CanonicalRule = (content) => {
  return { content, applied: false, reviewItems: [] };
};

const preserveCodeExamples: CanonicalRule = (content) => {
  return { content, applied: false, reviewItems: [] };
};

const RULE_PIPELINE: { name: CanonicalRuleName; fn: CanonicalRule }[] = [
  { name: 'PLATFORM_LOCKED', fn: platformLocked },
  { name: 'STRIP_FRONTMATTER', fn: stripFrontmatter },
  { name: 'STRIP_DISPATCH_EXAMPLES', fn: stripDispatchExamples },
  { name: 'GENERALIZE_TOOL_REFS', fn: generalizeToolRefs },
  { name: 'GENERALIZE_PATHS', fn: generalizePaths },
  { name: 'FLATTEN_ESCALATION', fn: flattenEscalation },
  { name: 'ENHANCE_NATIVE_CAPABILITY', fn: enhanceNativeCapability },
  { name: 'PRESERVE_MARKDOWN', fn: preserveMarkdown },
  { name: 'PRESERVE_CODE_EXAMPLES', fn: preserveCodeExamples },
];

export function toCanonical(sourceContent: string, metadata: SkillMetadata): CanonicalResult {
  let content = sourceContent;
  const rulesApplied: CanonicalRuleName[] = [];
  const reviewItems: string[] = [];
  let isPlatformLocked = false;

  for (const { name, fn } of RULE_PIPELINE) {
    const result = fn(content, metadata);
    content = result.content;
    if (result.applied) rulesApplied.push(name);
    reviewItems.push(...result.reviewItems);

    if (name === 'PLATFORM_LOCKED' && result.reviewItems.length > 0) {
      isPlatformLocked = true;
    }
  }

  return {
    markdown: content,
    rulesApplied,
    reviewItems,
    isPlatformLocked,
  };
}
