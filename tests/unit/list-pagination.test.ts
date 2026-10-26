import { describe, expect, it } from "vitest";
import {
  FETCH_SIZE,
  listHref,
  listPage,
  listSearch,
  listWindow,
  MAX_LIST_PAGE,
  PAGE_SIZE,
} from "../../lib/lists/pagination";

describe("bounded list navigation", () => {
  it.each([
    undefined,
    ["2", "3"],
    "0",
    "-1",
    "1.5",
    "1e3",
    "Infinity",
    "99999999999999999999999",
  ])("rejects an invalid or ambiguous page %j", (value) => {
    expect(listPage(value)).toBe(1);
  });
  it("keeps offsets inside the existing RPC contract", () => {
    expect(listPage("3")).toBe(3);
    expect(listPage("99999999")).toBe(MAX_LIST_PAGE);
    expect((MAX_LIST_PAGE - 1) * PAGE_SIZE).toBe(10000);
    expect(FETCH_SIZE).toBeLessThanOrEqual(100);
  });
  it("traverses 101 static records without displaying the lookahead twice", () => {
    const source = Array.from({ length: 101 }, (_, id) => ({ id }));
    const seen: number[] = [];
    for (let page = 1; page <= 3; page++) {
      const offset = (page - 1) * PAGE_SIZE;
      const result = listWindow(
        source.slice(offset, offset + FETCH_SIZE),
        page,
      );
      seen.push(...result.rows.map((row) => row.id));
      expect(result.hasMore).toBe(page < 3);
    }
    expect(seen).toEqual(source.map((row) => row.id));
    expect(listWindow(source.slice(200), 5)).toMatchObject({
      rows: [],
      hasMore: false,
    });
  });
  it("preserves encoded filters, never a client-supplied tenant or role", () => {
    const href = listHref(
      "/catalog",
      { q: 'A&B, "North"', state: "inactive" },
      3,
    );
    const url = new URL(href, "https://trace.example.test");
    expect(url.pathname).toBe("/catalog");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'A&B, "North"',
      state: "inactive",
      page: "3",
    });
    expect(listHref("/customers", { q: "" }, 1)).toBe("/customers");
  });
  it("handles repeated and hostile query values without throwing", () => {
    expect(listSearch(["first", "second"])).toBe("");
    expect(listSearch(" \nA\tB\u0000 ")).toBe("AB");
    expect(listSearch("a".repeat(101))).toHaveLength(100);
  });
});
