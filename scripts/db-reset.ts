import { readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPool } from "@db/client";

const DATA_DIRECTORY_NAME = "data";
const PRESERVED_DATA_DIRECTORY = "pos";

async function resetDatabase(): Promise<void> {
  const pool = createPool();

  try {
    console.log("Dropping drizzle metadata schema (if present)...");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE;");

    console.log("Dropping enrichment schema (if present)...");
    await pool.query("DROP SCHEMA IF EXISTS enrichment CASCADE;");

    console.log("Recreating enrichment schema...");
    await pool.query("CREATE SCHEMA IF NOT EXISTS enrichment;");
    await pool.query("ALTER SCHEMA enrichment OWNER TO CURRENT_USER;");
    await pool.query("GRANT ALL ON SCHEMA enrichment TO CURRENT_USER;");
  } finally {
    await pool.end();
  }

  console.log(
    "Database reset complete. Enrichment tables will be recreated on the next migration run.",
  );
}

async function cleanDataDirectory(): Promise<void> {
  const currentPath = fileURLToPath(import.meta.url);
  const repositoryRoot = resolve(dirname(currentPath), "../");
  const dataDirectory = resolve(repositoryRoot, DATA_DIRECTORY_NAME);

  const entries = await readdir(dataDirectory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === PRESERVED_DATA_DIRECTORY) {
        return;
      }

      const target = resolve(dataDirectory, entry.name);
      await rm(target, { recursive: true, force: true });
    }),
  );

  console.log(`Data directory cleaned. Preserved ${DATA_DIRECTORY_NAME}/${PRESERVED_DATA_DIRECTORY}.`);
}

async function main(): Promise<void> {
  await resetDatabase();
  await cleanDataDirectory();
}

const executedAsScript = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "");

if (executedAsScript) {
  try {
    await main();
  } catch (error) {
    console.error("Failed to reset the database:", error);
    process.exit(1);
  }
}

export { cleanDataDirectory, resetDatabase };
