import { build } from 'esbuild';
import glob from 'glob';
import path from 'path';

async function main() {
  try {
    // 1️⃣ Build the main server
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

    // 2️⃣ Build all server/api files (app.ts, routes.ts, etc)
    const apiFiles = glob.sync('server/api/**/*.ts');
    for (const file of apiFiles) {
      const outPath = path.join(
        'dist',
        path.dirname(file),
        path.basename(file, '.ts') + '.js'
      );
      await build({
        entryPoints: [file],
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: ['node22'],
        outfile: outPath,
        packages: 'external',
        sourcemap: true,
      });
    }

    // 3️⃣ Build the Vercel API handler
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
