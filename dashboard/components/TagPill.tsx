'use client';

import { X } from 'lucide-react';

interface TagPillProps {
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
}

export default function TagPill({ tag, onRemove, onClick }: TagPillProps) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ${onClick ? 'cursor-pointer hover:bg-blue-100' : ''}`}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:text-blue-900"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}
