'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Grid3X3, Languages, Swords } from 'lucide-react';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Yard', Icon: Grid3X3 },
  { href: '/translation', label: 'Translation', Icon: Languages },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 flex items-center gap-6 h-12">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 mr-2 shrink-0">
          <div className="w-6 h-6 rounded bg-gray-900 text-white flex items-center justify-center">
            <Swords size={13} />
          </div>
          <span className="text-sm font-bold text-gray-900 tracking-tight">Ronin</span>
        </Link>

        {/* Nav links */}
        {links.map(({ href, label, Icon }) => {
          // Exact match for home, prefix match for others
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-gray-900'
                  : 'text-gray-400 hover:text-gray-700'
              )}
            >
              <Icon
                size={14}
                className={clsx(isActive ? 'text-gray-900' : 'text-gray-400')}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
