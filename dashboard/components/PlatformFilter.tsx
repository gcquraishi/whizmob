'use client';

import { clsx } from 'clsx';
import { PLATFORM_LABELS } from '@/lib/platforms';

interface PlatformFilterProps {
  value: string;
  onChange: (value: string) => void;
  platforms: string[];
}

export default function PlatformFilter({ value, onChange, platforms }: PlatformFilterProps) {
  if (platforms.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => onChange('')}
        className={clsx(
          'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
          value === ''
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        )}
      >
        All
      </button>
      {platforms.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            value === p
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {PLATFORM_LABELS[p] || p}
        </button>
      ))}
    </div>
  );
}
