import { describe, expect, test } from "bun:test";
import { echoPkValues, paramChunkLimit, pkProjection } from "../../src/dialects/shared.js";
import type { Row, TableInfo } from "../../src/types.js";

describe("paramChunkLimit", () => {
  test("divides the param budget by column count, flooring", () => {
    expect(paramChunkLimit(65535, 5)).toBe(13107);
    expect(paramChunkLimit(32000, 3)).toBe(10666);
  });

  test("never returns less than 1, even for ultra-wide rows or zero columns", () => {
    expect(paramChunkLimit(100, 200)).toBe(1);
    expect(paramChunkLimit(65535, 0)).toBe(65535);
  });
});

describe("echoPkValues", () => {
  test("projects only the primary-key columns from each row", () => {
    const info = { primaryKeys: ["userId", "groupId"] } as TableInfo;
    const rows: Row[] = [{ userId: 1, groupId: 2, extra: "x" }];
    expect(echoPkValues(info, rows)).toEqual([{ userId: 1, groupId: 2 }]);
  });
});

describe("pkProjection", () => {
  test("maps each pk property to its column on the table", () => {
    const idColumn = { name: "id" };
    const info = { primaryKeys: ["id"], table: { id: idColumn } } as unknown as TableInfo;
    expect(pkProjection(info)).toEqual({ id: idColumn });
  });

  test("is empty for a table with no primary key", () => {
    const info = { primaryKeys: [], table: {} } as unknown as TableInfo;
    expect(pkProjection(info)).toEqual({});
  });
});
