import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['sql.js'],
  outputFileTracingIncludes: {
    '/api/**': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './data/ronin.db',
    ],
    '/agents/**': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './data/ronin.db',
    ],
  },
};

export default nextConfig;
