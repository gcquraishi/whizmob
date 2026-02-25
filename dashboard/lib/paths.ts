/**
 * Cross-platform path display utilities.
 * Works on macOS (/Users/<name>) and Linux (/home/<name>).
 */

/**
 * Replace the current user's home directory prefix with "~" for display.
 * Uses process.env.HOME when available (server-side), otherwise falls back
 * to a regex that matches both /Users/<name> and /home/<name>.
 */
export function toDisplayPath(absolutePath: string): string {
  // Server-side: use the actual HOME env var for an exact match first.
  const home = process.env.HOME;
  if (home && absolutePath.startsWith(home)) {
    return '~' + absolutePath.slice(home.length);
  }
  // Client-side or fallback: strip /Users/<name> or /home/<name>.
  return absolutePath.replace(/^\/(Users|home)\/[^/]+/, '~');
}
