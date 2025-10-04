import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import Database from "better-sqlite3";
import * as childProcess from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropLegacyIndex, runDbPushWithRetry } from "../scripts/db-push";

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "db-push-test-"));
  tempDirs.push(dir);
  return join(dir, "test.sqlite");
}

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

type SqliteDatabase = InstanceType<typeof Database>;

const defaultDatabasePath = join(process.cwd(), "db", "data.sqlite");

afterEach(() => {
  vi.clearAllMocks();
  rmSync(defaultDatabasePath, { force: true });
  rmSync(`${defaultDatabasePath}-journal`, { force: true });
});

function countIndex(dbPath: string, indexName: string): number {
  const sqlite = new Database(dbPath);
  const result = sqlite
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index' AND name = ?",
    )
    .get(indexName) as { count: number };
  sqlite.close();
  return result.count;
}

function createSpawnResult(
  status: number,
  stderr: string,
): ReturnType<typeof childProcess.spawnSync> {
  return {
    pid: 0,
    output: ["", "", stderr],
    stdout: "",
    stderr,
    status,
    signal: null,
    error: undefined,
  } as ReturnType<typeof childProcess.spawnSync>;
}

describe("dropLegacyIndex", () => {
  it.each([
    {
      indexName: "verbs_infinitive_idx",
      setup: (sqlite: SqliteDatabase) => {
        sqlite.exec(`
          CREATE TABLE verbs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            infinitive TEXT NOT NULL
          );
          CREATE UNIQUE INDEX verbs_infinitive_idx ON verbs (infinitive);
        `);
      },
    },
    {
      indexName: "verb_queue_device_idx",
      setup: (sqlite: SqliteDatabase) => {
        sqlite.exec(`
          CREATE TABLE verb_review_queues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL
          );
          CREATE UNIQUE INDEX verb_queue_device_idx ON verb_review_queues (device_id);
        `);
      },
    },
  ])("removes the %s when it exists", ({ indexName, setup }) => {
    const dbPath = createTempDbPath();
    const sqlite = new Database(dbPath);
    setup(sqlite);
    sqlite.close();

    const removed = dropLegacyIndex(dbPath, indexName);
    expect(removed).toBe(true);

    expect(countIndex(dbPath, indexName)).toBe(0);
  });

  it("returns false when the index is absent", () => {
    const dbPath = createTempDbPath();
    const sqlite = new Database(dbPath);
    sqlite.exec(
      "CREATE TABLE verbs (id INTEGER PRIMARY KEY AUTOINCREMENT, infinitive TEXT NOT NULL);",
    );
    sqlite.close();

    const removed = dropLegacyIndex(dbPath, "verbs_infinitive_idx");
    expect(removed).toBe(false);
  });
});

describe("runDbPushWithRetry", () => {
  it("retries after dropping a single legacy index", () => {
    const sqlite = new Database(defaultDatabasePath);
    sqlite.exec(`
      CREATE TABLE verbs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        infinitive TEXT NOT NULL
      );
      CREATE UNIQUE INDEX verbs_infinitive_idx ON verbs (infinitive);
    `);
    sqlite.close();

    const spawnMock = vi.mocked(childProcess.spawnSync);
    spawnMock
      .mockReturnValueOnce(
        createSpawnResult(1, "SqliteError: index verbs_infinitive_idx already exists"),
      )
      .mockReturnValueOnce(createSpawnResult(0, ""));

    const exitCode = runDbPushWithRetry();

    expect(exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(countIndex(defaultDatabasePath, "verbs_infinitive_idx")).toBe(0);
  });

  it("handles multiple sequential legacy index failures", () => {
    const sqlite = new Database(defaultDatabasePath);
    sqlite.exec(`
      CREATE TABLE verbs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        infinitive TEXT NOT NULL
      );
      CREATE UNIQUE INDEX verbs_infinitive_idx ON verbs (infinitive);
    `);
    sqlite.exec(`
      CREATE TABLE verb_review_queues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL
      );
      CREATE UNIQUE INDEX verb_queue_device_idx ON verb_review_queues (device_id);
    `);
    sqlite.close();

    const spawnMock = vi.mocked(childProcess.spawnSync);
    spawnMock
      .mockReturnValueOnce(
        createSpawnResult(1, "SqliteError: index verbs_infinitive_idx already exists"),
      )
      .mockReturnValueOnce(
        createSpawnResult(1, "SqliteError: index verb_queue_device_idx already exists"),
      )
      .mockReturnValueOnce(createSpawnResult(0, ""));

    const exitCode = runDbPushWithRetry();

    expect(exitCode).toBe(0);
    expect(spawnMock).toHaveBeenCalledTimes(3);
    expect(countIndex(defaultDatabasePath, "verbs_infinitive_idx")).toBe(0);
    expect(countIndex(defaultDatabasePath, "verb_queue_device_idx")).toBe(0);
  });

  it("returns the drizzle failure status when the index is unknown", () => {
    const sqlite = new Database(defaultDatabasePath);
    sqlite.exec(`
      CREATE TABLE verbs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        infinitive TEXT NOT NULL
      );
      CREATE UNIQUE INDEX verbs_infinitive_idx ON verbs (infinitive);
    `);
    sqlite.close();

    const spawnMock = vi.mocked(childProcess.spawnSync);
    spawnMock.mockReturnValueOnce(
      createSpawnResult(1, "SqliteError: index unrelated_idx already exists"),
    );

    const exitCode = runDbPushWithRetry();

    expect(exitCode).toBe(1);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(countIndex(defaultDatabasePath, "verbs_infinitive_idx")).toBe(1);
  });
});
