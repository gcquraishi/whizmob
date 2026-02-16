'use client';

import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

interface ScanDiff {
  added: number;
  removed: number;
  updated: number;
  total: number;
  added_names: string[];
  removed_names: string[];
}

interface ScanButtonProps {
  onScanComplete: (diff: ScanDiff) => void;
}

export default function ScanButton({ onScanComplete }: ScanButtonProps) {
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (!res.ok) throw new Error('Scan failed');
      const diff: ScanDiff = await res.json();
      onScanComplete(diff);
    } catch {
      // Error handled by parent
    } finally {
      setScanning(false);
    }
  }

  return (
    <button
      onClick={handleScan}
      disabled={scanning}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
        scanning
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-gray-900 text-white hover:bg-gray-800'
      )}
    >
      <RefreshCw size={14} className={clsx(scanning && 'animate-spin')} />
      {scanning ? 'Scanning...' : 'Scan Now'}
    </button>
  );
}
