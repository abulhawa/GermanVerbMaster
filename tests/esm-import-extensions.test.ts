import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const RELATIVE_IMPORT_PATTERN = /['"]((?:\.\.\/)+(?:server|db)\/[^'\"]*)['"]/g;
const ALLOWED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

describe('relative server/db imports', () => {
  it('always specify a file extension for ESM consumers', async () => {
    const directoriesToScan = ['api', 'db', 'scripts', 'tests'];
    const offenders: Array<{ file: string; specifier: string }> = [];

    for (const directory of directoriesToScan) {
      const absoluteDirectory = path.join(process.cwd(), directory);
      const files = await collectSourceFiles(absoluteDirectory);

      for (const file of files) {
        const contents = await fs.readFile(file, 'utf8');
        for (const match of contents.matchAll(RELATIVE_IMPORT_PATTERN)) {
          const specifier = match[1];
          const extension = path.extname(specifier);
          if (!ALLOWED_EXTENSIONS.has(extension)) {
            offenders.push({ file: path.relative(process.cwd(), file), specifier });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
