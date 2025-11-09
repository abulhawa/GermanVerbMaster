import type { IMemoryDb } from "pg-mem";

import { seedWordsFixture } from "./words.js";

export function seedMockData(mem: IMemoryDb): void {
  seedWordsFixture(mem);
}

export { seedWordsFixture } from "./words.js";
