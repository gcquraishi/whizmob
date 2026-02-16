'use client';

import { X, Plus, Minus, RefreshCw } from 'lucide-react';

interface ScanDiff {
  added: number;
  removed: number;
  updated: number;
  total: number;
  added_names: string[];
  removed_names: string[];
}

interface DiffModalProps {
  diff: ScanDiff;
  onClose: () => void;
}

export default function DiffModal({ diff, onClose }: DiffModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Scan Complete</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                <Plus size={16} />
              </div>
              <div>
                <div className="font-semibold text-gray-900">{diff.added}</div>
                <div className="text-xs text-gray-500">added</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <Minus size={16} />
              </div>
              <div>
                <div className="font-semibold text-gray-900">{diff.removed}</div>
                <div className="text-xs text-gray-500">removed</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <RefreshCw size={16} />
              </div>
              <div>
                <div className="font-semibold text-gray-900">{diff.total}</div>
                <div className="text-xs text-gray-500">total</div>
              </div>
            </div>
          </div>

          {diff.added_names.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 mb-1.5">New</div>
              <div className="space-y-1">
                {diff.added_names.map((name) => (
                  <div key={name} className="text-sm text-green-700 bg-green-50 px-2.5 py-1 rounded-md">
                    + {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.removed_names.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-500 mb-1.5">Removed</div>
              <div className="space-y-1">
                {diff.removed_names.map((name) => (
                  <div key={name} className="text-sm text-red-700 bg-red-50 px-2.5 py-1 rounded-md">
                    - {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.added === 0 && diff.removed === 0 && (
            <p className="text-sm text-gray-500">No changes detected. Inventory is up to date.</p>
          )}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
