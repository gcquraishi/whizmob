import type { WhizmobInventory } from '../types.js';

export function formatJson(inventory: WhizmobInventory): string {
  return JSON.stringify(inventory, null, 2);
}
