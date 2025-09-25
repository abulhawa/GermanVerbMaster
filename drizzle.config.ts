import { defineConfig } from "drizzle-kit";
import { join } from "node:path";

const defaultDatabasePath = join(process.cwd(), "db", "data.sqlite");
const databaseFile = process.env.DATABASE_FILE ?? defaultDatabasePath;

export default defineConfig({
  out: "./migrations",
  schema: "./db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseFile,
  },
});