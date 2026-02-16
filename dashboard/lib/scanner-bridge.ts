import { join } from 'node:path';
import { homedir } from 'node:os';

export async function runScan() {
  const roninRoot = join(process.cwd(), '..');
  const scannerPath = join(roninRoot, 'dist', 'scanner.js');

  const mod = await import(/* webpackIgnore: true */ scannerPath);
  const scan = mod.scan;

  const inventory = await scan({
    scanRoot: join(homedir(), 'Documents'),
    claudeDir: join(homedir(), '.claude'),
    cursorDir: join(homedir(), '.cursor'),
    format: 'json',
  });

  return inventory;
}
