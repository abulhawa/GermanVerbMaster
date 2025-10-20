import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackageJson = {
  engines?: {
    node?: string;
  };
};

const thisDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(thisDir, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;

describe('runtime requirements', () => {
  test('package.json advertises Node.js 22 compatibility', () => {
    expect(packageJson.engines?.node, 'package.json should define a Node engine range').toBeTruthy();
    expect(packageJson.engines?.node).toMatch(/^(>=22|22\.x)$/);
  });

  test('test environment runs on Node.js 22 or newer', () => {
    const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
    expect(Number.isNaN(major)).toBe(false);
    expect(major).toBeGreaterThanOrEqual(22);
  });
});
