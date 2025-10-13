import { exit } from "node:process";

import { getPool } from "@db";

import {
  restoreWordsBackupFromSupabase,
  type RestoreWordsBackupOptions,
} from "./backup";
import { SupabaseStorageNotConfiguredError } from "./storage";

interface RestoreArgs {
  objectPath?: string;
  force: boolean;
}

function parseArgs(argv: string[]): RestoreArgs {
  let objectPath: string | undefined;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--object" || arg === "-o") {
      objectPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--object=")) {
      objectPath = arg.split("=").slice(1).join("=");
      continue;
    }
  }

  return { objectPath, force };
}

function printUsage(): void {
  console.log("Usage: npm run enrichment:restore -- --object <path/in/bucket> --force");
  console.log("The script truncates the words table before importing the backup.");
}

async function main(): Promise<void> {
  const pool = getPool();
  const args = parseArgs(process.argv.slice(2));

  if (!args.force) {
    console.error("Refusing to restore without the --force flag. No changes were made.");
    printUsage();
    exit(1);
  }

  const options: RestoreWordsBackupOptions = {
    objectPath: args.objectPath,
    truncate: true,
  };

  try {
    const result = await restoreWordsBackupFromSupabase(options);
    console.log(
      `Restored ${result.inserted.toLocaleString()} words from ${result.objectPath} (schema v${result.summary.schemaVersion}).`,
    );
    if (result.sequenceValue !== null) {
      console.log(`Reset words_id_seq to ${result.sequenceValue}.`);
    }
  } catch (error) {
    if (error instanceof SupabaseStorageNotConfiguredError) {
      console.error("Supabase Storage is not configured. Provide SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ENRICHMENT_SUPABASE_BUCKET.");
      exit(1);
    }
    console.error("Failed to restore words backup", error);
    exit(1);
  } finally {
    await pool.end().catch((err) => {
      console.warn("Failed to close database pool cleanly", err);
    });
  }
}

main().catch((error) => {
  console.error("Unexpected error while restoring words backup", error);
  exit(1);
});
