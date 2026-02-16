import type { RoninInventory } from '../types.js';

export function formatJson(inventory: RoninInventory): string {
  return JSON.stringify(inventory, null, 2);
}
