export function toKebab(s: string): string {
  return s.replace(/\.md$/, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

export function titleCase(s: string): string {
  return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function extractFirstParagraph(content: string): string {
  const lines = content.split('\n');
  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!started) {
      if (trimmed && !trimmed.startsWith('#')) {
        started = true;
        paragraphLines.push(trimmed);
      }
      continue;
    }
    if (!trimmed || trimmed.startsWith('#')) break;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.join(' ').slice(0, 300);
}
