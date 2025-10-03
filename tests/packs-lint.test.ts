import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintAllPacks } from '../scripts/packs-lint';

describe('packs:lint', () => {
  it('passes for repository pack bundles', async () => {
    const issues = await lintAllPacks();
    expect(issues).toEqual([]);
  });

  it('reports structural issues for invalid packs', async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'packs-lint-'));
    const packPath = path.join(tempDir, 'invalid-pack.json');

    const pack = {
      pack: {
        id: 'pack:invalid:1',
        slug: 'invalid-pack',
        name: 'Invalid Pack',
        description: 'Example invalid pack',
        language: 'de',
        posScope: 'noun',
        license: '',
        licenseNotes: null,
        version: 1,
        checksum: null,
        metadata: {
          taskTypes: ['adj_ending'],
          size: 2,
          cefrLevels: ['B2'],
        },
        createdAt: 0,
        updatedAt: 0,
      },
      lexemes: [
        {
          id: 'de:noun:probe:1234',
          lemma: 'Probe',
          language: 'de',
          pos: 'noun',
          gender: null,
          metadata: {
            level: 'A1',
          },
          sourceIds: ['test-source'],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      inflections: [
        {
          id: 'inf:de:noun:probe:1234:abcd',
          lexemeId: 'de:noun:probe:1234',
          form: 'Proben',
          features: {
            case: 'accusative',
            number: 'plural',
          },
        },
      ],
      tasks: [
        {
          id: 'task:de:noun:probe:1234:noun_case_declension:1:abcd',
          lexemeId: 'de:noun:probe:1234',
          pos: 'noun',
          taskType: 'noun_case_declension',
          renderer: 'noun_case_declension',
          prompt: {
            lemma: 'Probe',
            pos: 'noun',
            requestedCase: 'accusative',
            requestedNumber: 'plural',
            instructions: 'Bilde die Akkusativ Plural-Form von "Probe".',
            cefrLevel: 'A1',
          },
          solution: {
            form: 'Proben',
          },
          hints: null,
          metadata: null,
          revision: 1,
          sourcePack: 'other-pack',
        },
      ],
      packLexemes: [
        {
          packId: 'pack:invalid:2',
          lexemeId: 'de:noun:probe:1234',
          primaryTaskId: 'task:missing',
          position: 2,
        },
      ],
    } satisfies Record<string, unknown>;

    await fs.writeFile(packPath, JSON.stringify(pack, null, 2), 'utf8');

    const issues = await lintAllPacks({ packDirectory: tempDir });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('license') }),
        expect.objectContaining({ message: expect.stringContaining('taskTypes') }),
        expect.objectContaining({ message: expect.stringContaining('Pack lexeme positions') }),
        expect.objectContaining({ message: expect.stringContaining('sourcePack') }),
      ]),
    );
  });
});
