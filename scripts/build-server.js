import { build } from 'esbuild';

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
  resolveExtensions: ['.ts', '.js'],
}).catch(() => process.exit(1));

console.log('✓ Server built successfully');
