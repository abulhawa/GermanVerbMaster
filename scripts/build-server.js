import { build } from 'esbuild';

async function main() {
  try {
    // Build the main server
    await build({
      entryPoints: ['server/index.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: ['node22'],
      outdir: 'dist/server',
      packages: 'external',
      sourcemap: true,
    });

    // Build the Vercel API handler
    await build({
      entryPoints: ['api/index.impl.ts'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: ['node22'],
      outdir: 'dist/api',
      sourcemap: true,
    });

    console.log('✓ Server and API built successfully');
  } catch (err) {
    console.error('❌ esbuild failed:', err);
    process.exit(1);
  }
}

main();
