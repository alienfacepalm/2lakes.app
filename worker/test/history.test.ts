import { describe, expect, it } from "vitest";
import { shapeHistoryPage } from "../src/db";

describe("shapeHistoryPage", () => {
  it("pages results and always includes maxSeq for rebuild detection", () => {
    const rows = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
    expect(shapeHistoryPage(rows, 0, 2, 9)).toEqual({
      rows: [{ seq: 1 }, { seq: 2 }],
      nextSeq: 2,
      hasMore: true,
      maxSeq: 9,
    });
  });

  it("returns afterSeq as nextSeq when the page is empty", () => {
    expect(shapeHistoryPage([], 40, 500, 40)).toEqual({
      rows: [],
      nextSeq: 40,
      hasMore: false,
      maxSeq: 40,
    });
  });
});
