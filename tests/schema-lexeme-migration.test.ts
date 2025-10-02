import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "migrations",
  "0005_create_lexeme_task_tables.sql",
);

describe("lexeme-centric migration", () => {
  it("creates all required tables and indexes", () => {
    const db = new Database(":memory:");
    const sql = readFileSync(migrationPath, "utf8");

    db.exec(sql);

    const lexemeColumns = db.prepare("PRAGMA table_info('lexemes')").all();
    const lexemeColumnNames = lexemeColumns.map((column) => column.name);
    expect(lexemeColumnNames).toEqual(
      expect.arrayContaining(["id", "lemma", "pos", "metadata", "source_ids"]),
    );

    const lexemeIndexes = db.prepare("PRAGMA index_list('lexemes')").all();
    expect(lexemeIndexes.some((idx) => idx.name === "lexemes_lemma_pos_idx")).toBe(true);

    const taskSpecFks = db.prepare("PRAGMA foreign_key_list('task_specs')").all();
    expect(taskSpecFks.some((fk) => fk.table === "lexemes")).toBe(true);

    const schedulingColumns = db.prepare("PRAGMA table_info('scheduling_state')").all();
    const schedulingNames = schedulingColumns.map((column) => column.name);
    expect(schedulingNames).toEqual(
      expect.arrayContaining([
        "device_id",
        "task_id",
        "priority_score",
        "last_result",
      ]),
    );

    const schedulingIndexes = db.prepare("PRAGMA index_list('scheduling_state')").all();
    expect(
      schedulingIndexes.some((idx) => idx.name === "scheduling_state_device_task_idx"),
    ).toBe(true);

    const packPkInfo = db.prepare("PRAGMA table_info('pack_lexeme_map')").all();
    const packPkColumns = packPkInfo.filter((column) => column.pk > 0).map((column) => column.name);
    expect(packPkColumns.sort()).toEqual(["lexeme_id", "pack_id"]);

    const telemetryColumns = db.prepare("PRAGMA table_info('telemetry_priorities')").all();
    expect(telemetryColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["task_id", "priority_score", "sampled_at"]),
    );

    db.close();
  });
});
