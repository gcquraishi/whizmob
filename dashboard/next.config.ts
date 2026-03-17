import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sql.js'],
  outputFileTracingIncludes: {
    '/api/**': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './data/whizmob.db',
    ],
    '/agents/**': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './data/whizmob.db',
    ],
    '/app/**': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './data/whizmob.db',
    ],
  },
};

export default nextConfig;
