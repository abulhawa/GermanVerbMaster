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

    console.log('✓ Server built successfully. API shim will be used as-is.');
  } catch (err) {
    console.error('❌ esbuild failed:', err);
    process.exit(1);
  }
}

main();
