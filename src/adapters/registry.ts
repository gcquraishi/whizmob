import type { TargetPlatform, TargetAdapter } from './types.js';
import { geminiAdapter } from './gemini.js';
import { dalleAdapter } from './dalle.js';
import { midjourneyAdapter } from './midjourney.js';

const adapters: Record<TargetPlatform, TargetAdapter> = {
  gemini: geminiAdapter,
  dalle: dalleAdapter,
  midjourney: midjourneyAdapter,
};

export function getAdapter(target: TargetPlatform): TargetAdapter {
  const adapter = adapters[target];
  if (!adapter) {
    throw new Error(`Unknown target platform: ${target}. Valid targets: ${listAdapters().join(', ')}`);
  }
  return adapter;
}

export function listAdapters(): TargetPlatform[] {
  return Object.keys(adapters) as TargetPlatform[];
}

export function isValidTarget(target: string): target is TargetPlatform {
  return target in adapters;
}
