export type { CreateMockPoolOptions } from "./mock/pool.js";
export { createMockPool } from "./mock/pool.js";

export {
  createEmptyResult,
  extractQueryConfig,
  handleCustomStatements,
  patchPool,
  sanitizeSql,
  wrapQuery,
  type NormalizedQuery,
  type QueryConfig,
} from "./mock/transactions.js";

export { seedMockData, seedWordsFixture } from "./mock/fixtures/index.js";
