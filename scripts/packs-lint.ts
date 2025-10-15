import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTaskAgainstRegistry } from '../shared/task-registry';

interface PackMetadata {
  taskTypes?: string[];
  size?: number;
  cefrLevels?: string[];
  [key: string]: unknown;
}

interface PackHeader {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  language: string;
  posScope: string;
  license: string;
  licenseNotes: string | null;
  version: number;
  checksum: string | null;
  metadata: PackMetadata | null;
  createdAt: number;
  updatedAt: number;
}

interface LexemeRecord {
  id: string;
  lemma: string;
  language: string;
  pos: string;
  gender: string | null;
  metadata?: {
    level?: string;
    english?: string;
    [key: string]: unknown;
  } | null;
  sourceIds?: string[] | null;
  frequencyRank?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

interface InflectionRecord {
  id: string;
  lexemeId: string;
  form: string;
  features: Record<string, unknown>;
}

interface TaskRecord {
  id: string;
  lexemeId: string;
  pos: string;
  taskType: string;
  renderer: string;
  prompt: unknown;
  solution: unknown;
  hints?: unknown;
  metadata?: Record<string, unknown> | null;
  revision: number;
  sourcePack: string;
}

interface PackLexemeRecord {
  packId: string;
  lexemeId: string;
  primaryTaskId: string | null;
  position: number;
}

interface PackFile {
  pack: PackHeader;
  lexemes: LexemeRecord[];
  inflections: InflectionRecord[];
  tasks: TaskRecord[];
  packLexemes?: PackLexemeRecord[];
  packLexemeMap?: PackLexemeRecord[];
}

export interface LintIssue {
  file: string;
  message: string;
}

export interface PackLintOptions {
  /**
   * Directory containing pack JSON files. Defaults to `data/packs` relative to CWD.
   */
  packDirectory?: string;
  /**
   * Explicit list of pack file paths. When provided, `packDirectory` is ignored.
   */
  packFiles?: string[];
}

export async function lintAllPacks(options: PackLintOptions = {}): Promise<LintIssue[]> {
  const { packDirectory, packFiles } = options;

  let filesToCheck: string[];
  if (packFiles && packFiles.length > 0) {
    filesToCheck = packFiles.map((filePath) => path.resolve(filePath));
  } else {
    const directory = packDirectory
      ? path.resolve(packDirectory)
      : path.resolve(process.cwd(), 'data', 'packs');
    let entries: Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true, encoding: 'utf8' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    filesToCheck = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(directory, entry.name));
  }

  const lintIssues: LintIssue[] = [];

  for (const filePath of filesToCheck) {
    const raw = await fs.readFile(filePath, 'utf8');
    let parsed: PackFile;
    try {
      parsed = JSON.parse(raw) as PackFile;
    } catch (error) {
      lintIssues.push({
        file: filePath,
        message: `Invalid JSON: ${(error as Error).message}`,
      });
      continue;
    }

    lintIssues.push(...lintPackFile(parsed, filePath));
  }

  return lintIssues;
}

function lintPackFile(packFile: PackFile, filePath: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const { pack, lexemes, inflections, tasks } = packFile;
  const packLexemes = packFile.packLexemes ?? packFile.packLexemeMap ?? [];

  if (!pack) {
    issues.push({ file: filePath, message: 'Missing `pack` header.' });
    return issues;
  }

  if (!packFile.packLexemes && !packFile.packLexemeMap) {
    issues.push({
      file: filePath,
      message: 'Pack is missing `packLexemeMap` entries.',
    });
  }

  if (!pack.license || !pack.license.trim()) {
    issues.push({ file: filePath, message: 'Pack header is missing a license value.' });
  }

  if (!pack.metadata) {
    issues.push({ file: filePath, message: 'Pack metadata is missing.' });
  }

  if (pack.metadata) {
    const { metadata } = pack;
    const declaredTaskTypes = new Set(
      Array.isArray(metadata.taskTypes) ? metadata.taskTypes.filter(Boolean) : [],
    );
    const actualTaskTypes = new Set(tasks.map((task) => task.taskType));
    if (!areSetsEqual(declaredTaskTypes, actualTaskTypes)) {
      issues.push({
        file: filePath,
        message: `Pack metadata taskTypes (${[...declaredTaskTypes].join(
          ', ',
        )}) do not match task definitions (${[...actualTaskTypes].join(', ')}).`,
      });
    }

    if (typeof metadata.size === 'number' && metadata.size !== lexemes.length) {
      issues.push({
        file: filePath,
        message: `Pack metadata size ${metadata.size} does not match lexeme count ${lexemes.length}.`,
      });
    }

    if (Array.isArray(metadata.cefrLevels)) {
      const declaredLevels = new Set(metadata.cefrLevels);
      for (const lexeme of lexemes) {
        const level = lexeme.metadata?.level;
        if (level && !declaredLevels.has(level)) {
          issues.push({
            file: filePath,
            message: `Lexeme ${lexeme.id} declares CEFR level ${level} not listed in pack metadata.`,
          });
        }
      }

      for (const task of tasks) {
        const cefrLevel = (task.prompt as { cefrLevel?: string } | undefined)?.cefrLevel;
        if (cefrLevel && !declaredLevels.has(cefrLevel)) {
          issues.push({
            file: filePath,
            message: `Task ${task.id} uses CEFR level ${cefrLevel} not listed in pack metadata.`,
          });
        }
      }
    }
  }

  const lexemeIds = new Set<string>();
  const lexemeById = new Map<string, LexemeRecord>();

  for (const lexeme of lexemes) {
    if (lexemeIds.has(lexeme.id)) {
      issues.push({
        file: filePath,
        message: `Duplicate lexeme id detected: ${lexeme.id}.`,
      });
    }
    lexemeIds.add(lexeme.id);
    lexemeById.set(lexeme.id, lexeme);

    if (pack.posScope !== 'mixed' && lexeme.pos !== pack.posScope) {
      issues.push({
        file: filePath,
        message: `Lexeme ${lexeme.id} pos ${lexeme.pos} does not match pack scope ${pack.posScope}.`,
      });
    }

    if (lexeme.language !== pack.language) {
      issues.push({
        file: filePath,
        message: `Lexeme ${lexeme.id} language ${lexeme.language} does not match pack language ${pack.language}.`,
      });
    }

    if (pack.posScope === 'noun' && !lexeme.gender) {
      issues.push({
        file: filePath,
        message: `Noun lexeme ${lexeme.id} is missing a gender value.`,
      });
    }

    if (pack.posScope === 'verb' && !lexeme.metadata?.level) {
      issues.push({
        file: filePath,
        message: `Verb lexeme ${lexeme.id} is missing a metadata.level value.`,
      });
    }
  }

  const inflectionIds = new Set<string>();
  for (const inflection of inflections) {
    if (inflectionIds.has(inflection.id)) {
      issues.push({
        file: filePath,
        message: `Duplicate inflection id detected: ${inflection.id}.`,
      });
    }
    inflectionIds.add(inflection.id);

    if (!lexemeById.has(inflection.lexemeId)) {
      issues.push({
        file: filePath,
        message: `Inflection ${inflection.id} references unknown lexeme ${inflection.lexemeId}.`,
      });
    }

    if (!inflection.form || !inflection.form.trim()) {
      issues.push({
        file: filePath,
        message: `Inflection ${inflection.id} has an empty form.`,
      });
    }
  }

  const taskIds = new Set<string>();
  for (const task of tasks) {
    if (taskIds.has(task.id)) {
      issues.push({
        file: filePath,
        message: `Duplicate task id detected: ${task.id}.`,
      });
    }
    taskIds.add(task.id);

    const lexeme = lexemeById.get(task.lexemeId);
    if (!lexeme) {
      issues.push({
        file: filePath,
        message: `Task ${task.id} references unknown lexeme ${task.lexemeId}.`,
      });
      continue;
    }

    if (task.pos !== lexeme.pos) {
      issues.push({
        file: filePath,
        message: `Task ${task.id} pos ${task.pos} does not match lexeme pos ${lexeme.pos}.`,
      });
    }

    if (task.sourcePack !== pack.slug) {
      issues.push({
        file: filePath,
        message: `Task ${task.id} sourcePack ${task.sourcePack} does not match pack slug ${pack.slug}.`,
      });
    }

    try {
      validateTaskAgainstRegistry(task.taskType, task.pos, task.renderer, task.prompt, task.solution);
    } catch (error) {
      issues.push({
        file: filePath,
        message: `Task ${task.id} failed registry validation: ${(error as Error).message}`,
      });
    }
  }

  const packLexemeIds = new Set<string>();
  const seenPositions: number[] = [];
  for (const packLexeme of packLexemes) {
    if (packLexeme.packId !== pack.id) {
      issues.push({
        file: filePath,
        message: `Pack lexeme entry ${packLexeme.lexemeId} references pack id ${packLexeme.packId} instead of ${pack.id}.`,
      });
    }

    if (!lexemeById.has(packLexeme.lexemeId)) {
      issues.push({
        file: filePath,
        message: `Pack lexeme entry references unknown lexeme ${packLexeme.lexemeId}.`,
      });
    }

    if (packLexemeIds.has(packLexeme.lexemeId)) {
      issues.push({
        file: filePath,
        message: `Duplicate pack lexeme entry detected for ${packLexeme.lexemeId}.`,
      });
    }
    packLexemeIds.add(packLexeme.lexemeId);
    seenPositions.push(packLexeme.position);

    if (packLexeme.primaryTaskId && !taskIds.has(packLexeme.primaryTaskId)) {
      issues.push({
        file: filePath,
        message: `Pack lexeme ${packLexeme.lexemeId} references unknown primary task ${packLexeme.primaryTaskId}.`,
      });
    }
  }

  if (packLexemes.length !== lexemes.length) {
    issues.push({
      file: filePath,
      message: `Pack lexeme entries (${packLexemes.length}) do not match lexeme count (${lexemes.length}).`,
    });
  }

  if (!positionsAreSequential(seenPositions)) {
    issues.push({
      file: filePath,
      message: 'Pack lexeme positions are not sequential starting at 1.',
    });
  }

  return issues;
}

function areSetsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function positionsAreSequential(positions: number[]): boolean {
  if (positions.length === 0) return true;
  const sorted = [...positions].sort((left, right) => left - right);
  return sorted.every((value, index) => value === index + 1);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const stats = arg ? await fs.stat(arg).catch(() => null) : null;
  const options: PackLintOptions = {};

  if (stats?.isDirectory()) {
    options.packDirectory = arg;
  } else if (stats?.isFile()) {
    options.packFiles = [arg];
  }

  const issues = await lintAllPacks(options);

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('All packs passed linting.');
}

const isCli = (() => {
  if (!process.argv[1]) return false;
  const scriptPath = path.resolve(process.argv[1]);
  const modulePath = fileURLToPath(import.meta.url);
  return scriptPath === modulePath;
})();

if (isCli) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
