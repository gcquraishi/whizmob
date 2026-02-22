'use client';

import { LayoutGrid, GitCompareArrows } from 'lucide-react';

interface SprawlToggleProps {
  mode: 'grid' | 'sprawl';
  onChange: (mode: 'grid' | 'sprawl') => void;
  groupCount: number;
}

export default function SprawlToggle({ mode, onChange, groupCount }: SprawlToggleProps) {
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => onChange('grid')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <LayoutGrid size={13} />
        Grid
      </button>
      <button
        onClick={() => onChange('sprawl')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'sprawl' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <GitCompareArrows size={13} />
        Sprawl
        {groupCount > 0 && (
          <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums">
            {groupCount}
          </span>
        )}
      </button>
    </div>
  );
}
