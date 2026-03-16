/**
 * Cognitive mode taxonomy — color mapping and labels.
 *
 * Used by:
 *   - Inspector page (mob card histogram, passport detail badges)
 *   - Inventory page (mode filter chips)
 *   - Passport detail page (mode badge)
 *
 * Color scheme:
 *   founder=blue, engineer=green, reviewer=amber,
 *   operator=gray, creative=purple, analyst=teal
 */

export interface ModeConfig {
  label: string;
  /** Tailwind bg class for badges/chips */
  bg: string;
  /** Tailwind text class for badges/chips */
  text: string;
  /** Hex color for histogram bars and graph elements */
  hex: string;
}

export const MODE_COLORS: Record<string, ModeConfig> = {
  founder:  { label: 'Founder',  bg: 'bg-blue-50',   text: 'text-blue-700',   hex: '#3b82f6' },
  engineer: { label: 'Engineer', bg: 'bg-green-50',  text: 'text-green-700',  hex: '#22c55e' },
  reviewer: { label: 'Reviewer', bg: 'bg-amber-50',  text: 'text-amber-700',  hex: '#f59e0b' },
  operator: { label: 'Operator', bg: 'bg-gray-100',  text: 'text-gray-600',   hex: '#9ca3af' },
  creative: { label: 'Creative', bg: 'bg-purple-50', text: 'text-purple-700', hex: '#a855f7' },
  analyst:  { label: 'Analyst',  bg: 'bg-teal-50',   text: 'text-teal-700',   hex: '#14b8a6' },
};

/** Ordered list of known modes for consistent rendering */
export const MODE_ORDER = ['founder', 'engineer', 'reviewer', 'operator', 'creative', 'analyst'] as const;

/**
 * Get mode config with graceful fallback for unknown/custom modes.
 * Returns undefined if mode is null/undefined (no badge should be shown).
 */
export function getModeConfig(mode: string | null | undefined): ModeConfig | undefined {
  if (!mode) return undefined;
  const lower = mode.toLowerCase();
  return MODE_COLORS[lower] ?? {
    label: mode.charAt(0).toUpperCase() + mode.slice(1),
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    hex: '#6b7280',
  };
}
