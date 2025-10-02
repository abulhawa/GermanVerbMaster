import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import drizzleConfig from "../drizzle.config";

const LEGACY_INDEX_NAMES = new Set([
  "verbs_infinitive_idx",
  "verb_queue_device_idx",
]);

function resolveDatabaseFile(): string {
  const credentials = drizzleConfig.dbCredentials;
  if (
    credentials &&
    typeof credentials === "object" &&
    "url" in credentials &&
    typeof credentials.url === "string"
  ) {
    return credentials.url;
  }

  return join(process.cwd(), "db", "data.sqlite");
}

export function dropLegacyIndex(
  databaseFile: string,
  indexName: string,
): boolean {
  if (!existsSync(databaseFile)) {
    return false;
  }

  const sqlite = new Database(databaseFile);

  try {
    const legacyIndex = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
      )
      .get(indexName) as { name: string } | undefined;

    if (!legacyIndex) {
      return false;
    }

    sqlite.exec(`DROP INDEX IF EXISTS "${indexName}";`);
    return true;
  } catch (error) {
    console.error(`Failed to drop legacy \"${indexName}\" index:`, error);
    return false;
  } finally {
    sqlite.close();
  }
}

function getLegacyIndexFromError(stderr: string): string | undefined {
  const match = stderr.match(/index (\w+) already exists/);
  if (!match) {
    return undefined;
  }

  const [, indexName] = match;
  return LEGACY_INDEX_NAMES.has(indexName) ? indexName : undefined;
}

function runDrizzlePush(): ReturnType<typeof spawnSync> {
  const drizzleCliPath = join(
    process.cwd(),
    "node_modules",
    "drizzle-kit",
    "bin.cjs",
  );

  const result = spawnSync(process.execPath, [drizzleCliPath, "push"], {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

export function runDbPushWithRetry(): number {
  const attemptedIndexes = new Set<string>();
  const databaseFile = resolveDatabaseFile();

  for (let attempt = 0; attempt <= LEGACY_INDEX_NAMES.size; attempt += 1) {
    const result = runDrizzlePush();

    if ((result.status ?? 1) === 0) {
      return 0;
    }

    const stderr = `${result.stderr ?? ""}`;
    const legacyIndex = getLegacyIndexFromError(stderr);

    if (!legacyIndex || attemptedIndexes.has(legacyIndex)) {
      return result.status ?? 1;
    }

    const dropped = dropLegacyIndex(databaseFile, legacyIndex);
    if (!dropped) {
      return result.status ?? 1;
    }

    attemptedIndexes.add(legacyIndex);
    console.log(
      `Detected legacy "${legacyIndex}" index. Dropped it before retrying drizzle-kit push...`,
    );
  }

  return 1;
}


async function main(): Promise<void> {
  const exitCode = runDbPushWithRetry();
  process.exit(exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
