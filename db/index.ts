// Export database client
export { db, createDb, createPool, getDb, getPool } from "./client.js";

// Export everything from schema so we can import from @db directly
export * from "./schema.js";