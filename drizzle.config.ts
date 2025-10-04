import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be provided to generate migrations.");
}

const sslMode = (process.env.DATABASE_SSL ?? process.env.PGSSLMODE ?? "").toLowerCase();
const sslConfiguration = ["disable", "allow", "prefer"].includes(sslMode)
  ? false
  : { rejectUnauthorized: false };

export default defineConfig({
  out: "./migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    ssl: sslConfiguration,
  },
});
