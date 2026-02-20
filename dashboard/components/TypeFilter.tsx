'use client';

import clsx from 'clsx';

const TYPES = [
  { value: '', label: 'All' },
  { value: 'subagent', label: 'Agents' },
  { value: 'skill', label: 'Skills' },
  { value: 'mcp', label: 'MCP Servers' },
  { value: 'project', label: 'Project Configs' },
  { value: 'settings', label: 'Settings' },
];

interface TypeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export default function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      {TYPES.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            value === t.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
