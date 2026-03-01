'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, ArrowRightLeft, Swords, Orbit } from 'lucide-react';
import clsx from 'clsx';

const links = [
  { href: '/', label: 'Inventory', Icon: LayoutGrid },
  { href: '/mobs', label: 'Mobs', Icon: Orbit },
  { href: '/translation', label: 'Translate', Icon: ArrowRightLeft, secondary: true },
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
          <span className="text-sm font-bold text-gray-900 tracking-tight">Whizmob</span>
        </Link>

        {/* Nav links */}
        {links.map(({ href, label, Icon, secondary }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-1.5 transition-colors',
                secondary ? 'text-xs' : 'text-sm font-medium',
                isActive
                  ? 'text-gray-900'
                  : secondary
                    ? 'text-gray-300 hover:text-gray-500'
                    : 'text-gray-400 hover:text-gray-700'
              )}
            >
              <Icon
                size={secondary ? 12 : 14}
                className={clsx(isActive ? 'text-gray-900' : secondary ? 'text-gray-300' : 'text-gray-400')}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
