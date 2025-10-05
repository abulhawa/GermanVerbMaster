import { build } from 'esbuild';

async function main() {
  // Build the main server (can keep packages: 'external' if desired)
  await build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node22'],
    outdir: 'dist/server',
    packages: 'external', // keep external for server if you want deps externalized
  }).catch(() => process.exit(1));

  // Build the Vercel API handler into dist/api (do NOT mark entry as external)
  await build({
    entryPoints: ['api/index.impl.ts'], // the real implementation (not the shim)
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node22'],
    outdir: 'dist/api',
    // Ensure we do NOT externalize packages that would match the entry.
    // Either omit `packages` or set to 'inline' so the entry is bundled.
    packages: 'inline',
    // If you need to exclude native modules, use `external: ['better-sqlite3', ...]`
    // external: ['some-native-module'],
  }).catch(() => process.exit(1));

  console.log('✓ Server and API built successfully');
}

main();
