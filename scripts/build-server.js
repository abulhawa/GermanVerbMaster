import { build } from 'esbuild';

// Build the main server
await build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
  alias: {
    '@db': './db',
    '@shared': './shared',
  },
}).catch(() => process.exit(1));

// Build the Vercel API handler
await build({
  entryPoints: ['api/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'api',
  outExtension: { '.js': '.mjs' },
  packages: 'external',
  alias: {
    '@db': './db',
    '@shared': './shared',
  },
}).catch(() => process.exit(1));

console.log('✓ Server and API built successfully');