import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Nav from '@/components/Nav';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Whizmob — Agent Inventory',
  description: 'Agent inventory and management tool for Claude Code users',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-gray-50 text-gray-900 antialiased`}>
        <div className="min-h-screen flex flex-col">
          <Nav />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
