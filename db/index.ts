import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@db/schema";

const defaultDatabasePath = join(process.cwd(), "db", "data.sqlite");
const databaseFile = process.env.DATABASE_FILE ?? defaultDatabasePath;

mkdirSync(dirname(databaseFile), { recursive: true });

const sqlite = new Database(databaseFile);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
