// scripts/build-server.js
//
// ESM Node build script for esbuild that produces:
//  - dist/api/index.js  (single-file API bundle for Vercel shim)
//  - dist/server/index.js (server bundle for local or server use)
//
// Usage: `node scripts/build-server.js`
// Assumes your package.json uses "type": "module" or Node runs with --input-type=module
//
// The script marks problematic native/runtime-only packages as external so esbuild
// won't try to statically resolve platform-specific binaries or optional deps.
//
// Notes:
//  - Adjust `entryServer` if your server entry is in a different path.
//  - Adjust `externalDeps` if you want to bundle more or fewer modules.

import { build } from 'esbuild';
import fs from 'fs/promises';
import path from 'path';

/**
 * @type {string}
 * Entry file that creates the API app and registers routes (your server entry).
 * This file should call `registerRoutes(app)` so the bundled API includes routes.
 */
const entryServer = 'server/index.ts';

/**
 * @type {string}
 * Where we want the single-file API bundle to live for the Vercel shim to import.
 */
const apiOutfile = 'dist/api/index.js';

/**
 * @type {string}
 * Optional server bundle path (useful for local running or other deployments).
 */
const serverOutfile = 'dist/server/index.js';

/**
 * Modules & patterns we should leave external (do not try to bundle).
 * Keep this list conservative; add entries for packages that:
 *  - provide platform-native binaries (lightningcss, fsevents)
 *  - provide generator tooling used only at build-time (vite-pwa assets-generator)
 *  - do dynamic requires of package.json files (some Babel internals)
 */
const externalDeps = [
  // Node builtins (esbuild treats builtins differently, but being explicit is okay)
  'fs', 'path', 'crypto', 'http', 'https', 'stream', 'util', 'zlib',

  // macOS-only optional native watcher
  'fsevents',

  // LightningCSS: native bits resolved at runtime inside the package
  // We leave the package itself external so the binary resolution happens at runtime.
  'lightningcss',
  '../pkg',
  // (the pattern `../lightningcss.*.node` cannot be expressed here; bundling lightningcss is avoided)

  // Vite PWA generator runtime helpers — not needed in the runtime bundle, only at build-time
  '@vite-pwa/assets-generator/api/generate-assets',
  '@vite-pwa/assets-generator/api/instructions',
  '@vite-pwa/assets-generator/config',
  '@vite-pwa/assets-generator/api/generate-html-markup',
  '@vite-pwa/assets-generator/api/generate-manifest-icons-entry',

  // Babel preset json lookup that causes esbuild to try to resolve package.json
  '@babel/preset-typescript/package.json',

  // Any other modules you want to leave for runtime resolution can go here
];

/**
 * Build options shared between server and api (base)
 * @returns {import('esbuild').BuildOptions}
 */
function baseBuildOptions() {
  return {
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node22'],
    sourcemap: true,
    // Keep external modules out of the bundle so runtime can resolve them.
    external: externalDeps,
    // Increase log level for debugging if necessary:
    // logLevel: 'info',
  };
}

/**
 * Ensure folder exists (like dist/api, dist/server)
 * @param {string} outFile
 */
async function ensureDirForFile(outFile) {
  const dir = path.dirname(outFile);
  await fs.mkdir(dir, { recursive: true });
}

async function buildApiBundle() {
  console.log('> Building API bundle (single file) ->', apiOutfile);
  await ensureDirForFile(apiOutfile);

  await build({
    ...baseBuildOptions(),
    entryPoints: [entryServer], // bundle server entry (must register routes)
    outfile: apiOutfile,
    // If your code uses __dirname or __filename, consider adding:
    // define: { '__dirname': '"/var/task"' },
  });

  console.log('✓ API bundle created:', apiOutfile);
}

async function buildServerBundle() {
  console.log('> Building server bundle ->', serverOutfile);
  await ensureDirForFile(serverOutfile);

  // We intentionally bundle server entry again (separate file) so local/server usage
  // can import dist/server/index.js if needed. This duplicates work but simplifies paths.
  await build({
    ...baseBuildOptions(),
    entryPoints: [entryServer],
    outfile: serverOutfile,
  });

  console.log('✓ Server bundle created:', serverOutfile);
}

async function main() {
  try {
    // Build API single-file (Vercel)
    await buildApiBundle();

    // Build server bundle as well (optional but helpful)
    await buildServerBundle();

    console.log('✓ All builds finished');
    process.exit(0);
  } catch (err) {
    console.error('❌ esbuild failed:', err);
    process.exit(1);
  }
}

main();
