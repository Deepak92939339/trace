import { describe, expect, it } from "vitest";
import { printMeasures } from "../../lib/quotes/print-measures";
import {
  modelPageHeightMm,
  paginatePrintDocument,
  PRINT_UNITS_MM,
  usablePageHeightMm,
  type PrintMeasures,
  type PrintPlanPage,
} from "../../lib/quotes/print-pagination";
import {
  capacityEm,
  charWidthEm,
  countLines,
  wrapText,
} from "../../lib/quotes/print-text";

function measures(options: {
  items: number;
  milestones?: number;
  charges?: number;
  notesLines?: number;
  itemLines?: number;
  scheduleLines?: number;
  chargeLines?: number;
  partiesMm?: number;
}): PrintMeasures {
  return {
    itemLines: Array(options.items).fill(options.itemLines ?? 2),
    chargeLines: Array(options.charges ?? 0).fill(options.chargeLines ?? 1),
    scheduleLines: Array(options.milestones ?? 0).fill(
      options.scheduleLines ?? 1,
    ),
    notesLines: options.notesLines ?? 0,
    partiesMm: options.partiesMm ?? 62,
  };
}

function ranges(
  pages: readonly PrintPlanPage[],
  key: "items" | "charges" | "schedule" | "notes",
) {
  const covered: number[] = [];
  for (const page of pages) {
    const [from, to] = page[key];
    if (to > from) {
      if (covered.length) expect(from).toBe(covered[covered.length - 1]! + 1);
      else expect(from).toBe(0);
      for (let index = from; index < to; index += 1) covered.push(index);
    }
  }
  return covered.length;
}

/** Everything a correct plan must satisfy, whatever the input. */
function check(input: PrintMeasures, label: string) {
  const pages = paginatePrintDocument(input);
  const where = `${label}`;
  expect(pages.length, where).toBeGreaterThanOrEqual(1);
  // Every row, charge, milestone and notes line appears exactly once, in order.
  expect(ranges(pages, "items"), where).toBe(input.itemLines.length);
  expect(ranges(pages, "charges"), where).toBe(input.chargeLines.length);
  expect(ranges(pages, "schedule"), where).toBe(input.scheduleLines.length);
  expect(ranges(pages, "notes"), where).toBe(input.notesLines);
  // Single blocks appear once; the totals follow all charge rows; "issued by" ends the document.
  expect(
    pages.filter((page) => page.totals),
    where,
  ).toHaveLength(1);
  expect(
    pages.filter((page) => page.taxNote),
    where,
  ).toHaveLength(1);
  expect(
    pages.filter((page) => page.issuedBy),
    where,
  ).toHaveLength(1);
  expect(pages[pages.length - 1]!.issuedBy, where).toBe(true);
  const totalsPage = pages.findIndex((page) => page.totals);
  const lastChargePage = pages.reduce(
    (found, page, index) => (page.charges[1] > page.charges[0] ? index : found),
    -1,
  );
  expect(totalsPage, where).toBeGreaterThanOrEqual(lastChargePage);
  // Every page fits one A4 sheet in the model, and none is empty.
  pages.forEach((page, index) => {
    expect(
      modelPageHeightMm(page, index, input),
      `${where} page ${index + 1}`,
    ).toBeLessThanOrEqual(usablePageHeightMm() + 1e-9);
    if (index > 0)
      expect(
        page.items[1] > page.items[0] ||
          page.totals ||
          page.taxNote ||
          page.schedule[1] > page.schedule[0] ||
          page.notes[1] > page.notes[0] ||
          page.charges[1] > page.charges[0] ||
          page.issuedBy,
        `${where} page ${index + 1} is not empty`,
      ).toBe(true);
  });
  // Page 1 carries a row whenever there are rows; item-less pages only trail the rows.
  if (input.itemLines.length > 0)
    expect(pages[0]!.items[1], where).toBeGreaterThan(0);
  let sawItemless = false;
  pages.forEach((page, index) => {
    const itemless = page.items[1] === page.items[0];
    if (index > 0 && itemless) sawItemless = true;
    if (sawItemless)
      expect(itemless, `${where} rows never follow a summary-only page`).toBe(
        true,
      );
  });
  // The closing line never stands alone.
  for (const page of pages) {
    if (page.issuedBy)
      expect(
        page.items[1] > page.items[0] ||
          page.totals ||
          page.taxNote ||
          page.schedule[1] > page.schedule[0] ||
          page.notes[1] > page.notes[0] ||
          page.charges[1] > page.charges[0],
        `${where} issued-by line shares its page`,
      ).toBe(true);
  }
  // A summary-only page holding the totals exists only if the totals cannot sit with a row.
  if (input.itemLines.length > 0 && totalsPage > 0) {
    const page = pages[totalsPage]!;
    if (page.items[1] === page.items[0]) {
      const previous = pages[totalsPage - 1]!;
      const lastRow = previous.items[1] - 1;
      const withRow: PrintPlanPage = {
        ...page,
        items: [lastRow, lastRow + 1],
      };
      const sharedIndex = totalsPage; // as a continued page
      const alone = modelPageHeightMm(withRow, sharedIndex, input);
      const onPrevious = modelPageHeightMm(
        { ...previous, totals: true, charges: page.charges },
        totalsPage - 1,
        input,
      );
      expect(
        alone > usablePageHeightMm() ||
          onPrevious > usablePageHeightMm() ||
          previous.items[1] - previous.items[0] <= 1,
        `${where} summary-only totals page is justified`,
      ).toBe(true);
    }
  }
  return pages;
}

describe("page model: the matrix", () => {
  const itemCounts = [0, 1, 14, 15, 40];
  const milestoneCounts = [0, 3, 12];
  const chargeCounts = [0, 5];
  const notes = [
    ["short notes", 2],
    ["long notes", 56],
  ] as const;
  for (const items of itemCounts)
    for (const milestones of milestoneCounts)
      for (const charges of chargeCounts)
        for (const [notesLabel, notesLines] of notes)
          it(`${items} items, ${milestones} milestones, ${charges} charges, ${notesLabel}`, () => {
            check(
              measures({ items, milestones, charges, notesLines }),
              `${items}/${milestones}/${charges}/${notesLabel}`,
            );
          });
});

describe("page model: shape", () => {
  it("a bare quotation is one page", () => {
    expect(paginatePrintDocument(measures({ items: 1 }))).toHaveLength(1);
    expect(paginatePrintDocument(measures({ items: 0 }))).toHaveLength(1);
  });

  it("is deterministic", () => {
    const input = measures({
      items: 40,
      milestones: 12,
      charges: 5,
      notesLines: 56,
    });
    expect(paginatePrintDocument(input)).toEqual(paginatePrintDocument(input));
  });

  it("more rows never mean fewer pages", () => {
    let previous = 0;
    for (let items = 0; items <= 60; items += 1) {
      const count = paginatePrintDocument(
        measures({ items, milestones: 3, charges: 5, notesLines: 6 }),
      ).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  it("40 plain rows take more than three pages: 16 mm rows cannot fit 14 to a sheet", () => {
    const pages = paginatePrintDocument(measures({ items: 40 }));
    expect(pages.length).toBeGreaterThan(3);
    // Rows per page follow the unit model, not a fixed chunk size.
    const first = pages[0]!.items[1] - pages[0]!.items[0];
    expect(first).toBeLessThan(14);
  });

  it("page 1 reserves the parties block: taller parties mean fewer rows on page 1", () => {
    const small = paginatePrintDocument(
      measures({ items: 40, partiesMm: 40 }),
    )[0]!;
    const large = paginatePrintDocument(
      measures({ items: 40, partiesMm: 110 }),
    )[0]!;
    expect(large.items[1]).toBeLessThan(small.items[1]);
  });

  it("the totals share the last page with a row when one fits there", () => {
    for (let items = 1; items <= 60; items += 1) {
      const pages = paginatePrintDocument(measures({ items }));
      const totalsPage = pages.find((page) => page.totals)!;
      expect(
        totalsPage.items[1] - totalsPage.items[0],
        `${items} rows`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses a summary-only page when the final blocks cannot fit with any row", () => {
    // Twelve long milestone labels plus five charges and 56 lines of notes cannot ride with rows.
    const input = measures({
      items: 3,
      milestones: 12,
      scheduleLines: 3,
      charges: 5,
      notesLines: 56,
    });
    const pages = check(input, "heavy tail");
    expect(
      pages.some((page, index) => index > 0 && page.items[1] === page.items[0]),
    ).toBe(true);
  });

  it("splits a very large charge list across pages and puts the totals after its last row", () => {
    const pages = check(
      measures({ items: 2, charges: 25, chargeLines: 8 }),
      "25 long charges",
    );
    expect(
      pages.filter((page) => page.charges[1] > page.charges[0]).length,
    ).toBeGreaterThan(1);
  });

  it("copes with the limits: 100 rows, 25 charges, 12 milestones, 5000 characters of notes", () => {
    check(
      measures({
        items: 100,
        itemLines: 17,
        charges: 25,
        chargeLines: 10,
        milestones: 12,
        scheduleLines: 5,
        notesLines: 60,
      }),
      "limits",
    );
  });

  it("tall rows (long descriptions) mean fewer rows per page", () => {
    const short = paginatePrintDocument(
      measures({ items: 30, itemLines: 2 }),
    )[0]!;
    const tall = paginatePrintDocument(
      measures({ items: 30, itemLines: 8 }),
    )[0]!;
    expect(tall.items[1]).toBeLessThan(short.items[1]);
  });

  it("holds for every item count from 0 to 100 with a heavy tail", () => {
    for (let items = 0; items <= 100; items += 1)
      check(
        measures({
          items,
          milestones: 12,
          charges: 5,
          notesLines: 56,
          itemLines: 2 + (items % 5),
        }),
        `n=${items}`,
      );
  });

  it("documents its units: usable height is the A4 content area minus the safety reserve", () => {
    expect(PRINT_UNITS_MM.contentHeight).toBe(297 - 17 - 15);
    expect(usablePageHeightMm()).toBe(
      PRINT_UNITS_MM.contentHeight - PRINT_UNITS_MM.safety,
    );
  });
});

describe("text wrapping estimate", () => {
  const cap = capacityEm(60, 9);

  it("wraps at word boundaries, covers the text and never splits mid-word when a break exists", () => {
    const text =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau";
    const lines = wrapText(text, { capacityEm: cap });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      const piece = text.slice(line.start, line.end);
      expect(piece).toBe(piece.trim());
      expect(text[line.end] === " " || line.end === text.length).toBe(true);
    }
    expect(lines[0]!.start).toBe(0);
    expect(lines[lines.length - 1]!.end).toBe(text.length);
  });

  it("honours newlines and blank lines", () => {
    expect(wrapText("a\n\nb", { capacityEm: cap })).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 4 },
    ]);
    expect(countLines("", { capacityEm: cap })).toBe(1);
  });

  it("breaks an over-long unbroken word", () => {
    expect(countLines("W".repeat(200), { capacityEm: cap })).toBeGreaterThan(3);
  });

  it("estimates wide text as wider: capitals, CJK and bold take more lines", () => {
    const lower = "abcdefghij ".repeat(30);
    expect(
      countLines(lower.toUpperCase(), { capacityEm: cap }),
    ).toBeGreaterThan(countLines(lower, { capacityEm: cap }));
    expect(charWidthEm("日")).toBeGreaterThan(charWidthEm("a"));
    expect(
      countLines(lower, { capacityEm: cap, bold: true }),
    ).toBeGreaterThanOrEqual(countLines(lower, { capacityEm: cap }));
  });

  it("5000 characters of English at 9 pt over 178 mm estimate to a plausible number of lines (the real check is the PDF e2e)", () => {
    const text = "lorem ipsum dolor sit amet ".repeat(200).slice(0, 5000);
    const lines = countLines(text, { capacityEm: capacityEm(177, 9) });
    expect(lines).toBeGreaterThanOrEqual(45);
    expect(lines).toBeLessThanOrEqual(75);
  });
});

describe("measures from quotation text", () => {
  const source = {
    items: [
      { sku: "A-1", description: "Short" },
      { sku: "A-2", description: "A much longer description ".repeat(12) },
    ],
    charges: [{ description: "Freight" }],
    schedule: [{ label: "Deposit" }, { label: "Final ".repeat(30) }],
    notes: "one\ntwo\nthree",
    seller: {
      legalName: "Tender Seller Pvt Ltd",
      addressLine1: "1 Market Road",
      addressLine2: null,
      city: "Mumbai",
      region: "MH",
      postalCode: "400001",
      countryCode: "IN",
      taxIdentifier: null,
      contactEmail: null,
      contactPhone: null,
    },
    customer: {
      name: "Buyer",
      contactName: "",
      email: "b@example.test",
      address: "Road, City, IN",
      taxIdentifier: null,
    },
  };

  it("counts item, charge, milestone and notes lines", () => {
    const result = printMeasures(source);
    expect(result.itemLines[0]).toBe(2);
    expect(result.itemLines[1]!).toBeGreaterThan(result.itemLines[0]!);
    expect(result.chargeLines).toEqual([1]);
    expect(result.scheduleLines[0]).toBe(1);
    expect(result.scheduleLines[1]!).toBeGreaterThan(1);
    expect(result.notesLines).toBe(3);
    expect(printMeasures({ ...source, notes: "" }).notesLines).toBe(0);
  });

  it("sizes the parties block from the taller box and handles a missing seller", () => {
    const base = printMeasures(source).partiesMm;
    const verbose = printMeasures({
      ...source,
      customer: {
        ...source.customer,
        address: "A very long billing address line ".repeat(10),
      },
    }).partiesMm;
    expect(verbose).toBeGreaterThan(base);
    expect(
      printMeasures({ ...source, seller: null }).partiesMm,
    ).toBeGreaterThan(30);
  });
});
