/**
 * Page model for the issued quotation print document (browser print and stored PDF).
 *
 * `chunkPrintItems` (in the component) splits by item count only. That cannot work: a page also
 * carries a header, the parties, a table head and, on the last page, charges, totals, payment
 * schedule, notes and the issuance lines, and the footer is absolutely positioned inside a
 * 297 mm box, so any overflow produced extra physical pages with the wrong "Page X of N".
 *
 * This module is a pure unit-height model. Every block has a height in millimetres (the constants
 * below, measured from the print CSS in Chromium at A4 and rounded up), every page has 265 mm of
 * content area minus a small safety reserve, and blocks are laid out greedily in document order:
 *
 *   page 1       full header, seller and customer, table head, item rows, then the final blocks
 *   continued    compact header (number and revision), "Continued" label, table head, item rows
 *   summary-only the same compact header, then only final blocks (no item rows)
 *
 * Final blocks, in order: charges (flows by row) with the totals, the tax-mode statement, the
 * payment schedule (flows by row), the notes (flow by estimated line) and the "issued by" line.
 * The totals block always sits on the page with at least one item row unless that is impossible,
 * in which case a summary-only page is added. tests/e2e/p5b-print-pagination.spec.ts proves the
 * model against real PDFs: physical page count equals the number of .print-page articles.
 */
export const PRINT_UNITS_MM = {
  /** A4 height 297 minus 17 top and 15 bottom padding of .print-page. */
  contentHeight: 265,
  /** Reserved on every page so rounding and font differences never spill a page. */
  safety: 4,
  firstHeader: 33,
  compactHeader: 14,
  continuedLabel: 8,
  tableHead: 10,
  itemRowBase: 7.4,
  itemRowLine: 4.6,
  /** .print-final margin-top, and the grid gap between its blocks. */
  finalTop: 7,
  gap: 8,
  /** The five-row totals block. */
  totals: 50,
  chargesHead: 8,
  chargeRowBase: 4.6,
  chargeRowLine: 5.3,
  taxNote: 5,
  scheduleHead: 16,
  scheduleRowBase: 4.6,
  scheduleRowLine: 4.6,
  notesHead: 12.5,
  notesLine: 4.9,
  issuedBy: 5,
} as const;

/** Orphan control: a split schedule or notes block keeps at least this much together. */
const MIN_SCHEDULE_ROWS = 1;
const MIN_NOTES_LINES = 2;

export type PrintMeasures = {
  /** Estimated text lines of each item row (SKU lines plus description lines). */
  itemLines: readonly number[];
  /** Estimated text lines of each charge description. */
  chargeLines: readonly number[];
  /** Estimated text lines of each milestone label. */
  scheduleLines: readonly number[];
  /** Estimated lines of the notes text (0 when there are none). */
  notesLines: number;
  /** Height of the seller and customer block on page 1, including its padding. */
  partiesMm: number;
};

export type PrintPlanPage = {
  /** Item rows on this page, [start, end). */
  items: readonly [number, number];
  /** Charge rows on this page, [start, end). */
  charges: readonly [number, number];
  /** The totals block (it ends the charges list on its page). */
  totals: boolean;
  taxNote: boolean;
  /** Milestone rows on this page, [start, end). */
  schedule: readonly [number, number];
  /** Estimated notes lines on this page, [start, end). */
  notes: readonly [number, number];
  issuedBy: boolean;
};

function usable() {
  return PRINT_UNITS_MM.contentHeight - PRINT_UNITS_MM.safety;
}

const rowHeight = (lines: number) =>
  PRINT_UNITS_MM.itemRowBase + PRINT_UNITS_MM.itemRowLine * lines;
const chargeRowHeight = (lines: number) =>
  PRINT_UNITS_MM.chargeRowBase + PRINT_UNITS_MM.chargeRowLine * lines;
const scheduleRowHeight = (lines: number) =>
  PRINT_UNITS_MM.scheduleRowBase + PRINT_UNITS_MM.scheduleRowLine * lines;

type Cursor = {
  charge: number;
  totals: boolean;
  taxNote: boolean;
  schedule: number;
  notes: number;
  issuedBy: boolean;
};

type MutablePage = {
  items: [number, number];
  charges: [number, number];
  totals: boolean;
  taxNote: boolean;
  schedule: [number, number];
  notes: [number, number];
  issuedBy: boolean;
};

function emptyPage(itemStart: number, itemEnd: number): MutablePage {
  return {
    items: [itemStart, itemEnd],
    charges: [0, 0],
    totals: false,
    taxNote: false,
    schedule: [0, 0],
    notes: [0, 0],
    issuedBy: false,
  };
}

function pageHead(index: number, measures: PrintMeasures, hasItems: boolean) {
  const u = PRINT_UNITS_MM;
  if (index === 0) return u.firstHeader + measures.partiesMm + u.tableHead;
  return u.compactHeader + u.continuedLabel + (hasItems ? u.tableHead : 0);
}

function blockDone(cursor: Cursor, measures: PrintMeasures) {
  return (
    cursor.totals &&
    cursor.taxNote &&
    cursor.schedule >= measures.scheduleLines.length &&
    cursor.notes >= measures.notesLines &&
    cursor.issuedBy
  );
}

function chargesHeight(
  measures: PrintMeasures,
  from: number,
  to: number,
  withTotals: boolean,
) {
  const u = PRINT_UNITS_MM;
  let rows = 0;
  for (let index = from; index < to; index += 1)
    rows += chargeRowHeight(measures.chargeLines[index]!);
  const list = to > from ? u.chargesHead + rows : 0;
  return withTotals ? Math.max(u.totals, list) : list;
}

/**
 * Places as many final blocks as fit in `available` mm, in order, advancing `cursor`. Returns
 * whether anything was placed. With `force`, the next block is placed even if it does not fit
 * (used on an empty page so the layout always makes progress).
 */
function placeBlocks(
  page: MutablePage,
  cursor: Cursor,
  measures: PrintMeasures,
  available: number,
  force: boolean,
) {
  const u = PRINT_UNITS_MM;
  let used = 0;
  let placed = false;
  const lead = () => (placed ? u.gap : u.finalTop);
  const fits = (height: number) => used + lead() + height <= available;
  const take = (height: number) => {
    used += lead() + height;
    placed = true;
  };

  // Charges rows (flowing) together with the totals block.
  if (!cursor.totals) {
    const total = measures.chargeLines.length;
    const whole = chargesHeight(measures, cursor.charge, total, true);
    if (fits(whole)) {
      page.charges = [cursor.charge, total];
      page.totals = true;
      cursor.charge = total;
      cursor.totals = true;
      take(whole);
    } else if (total > cursor.charge) {
      // Take the rows that fit on their own; the rest (and the totals) follow on a later page.
      let end = cursor.charge;
      while (
        end < total &&
        fits(chargesHeight(measures, cursor.charge, end + 1, false))
      )
        end += 1;
      if (end === cursor.charge && force && !placed) end += 1;
      if (end === cursor.charge) return placed;
      page.charges = [cursor.charge, end];
      take(chargesHeight(measures, cursor.charge, end, false));
      cursor.charge = end;
      return placed;
    } else if (force && !placed) {
      page.totals = true;
      cursor.totals = true;
      take(whole);
    } else {
      return placed;
    }
  }

  if (!cursor.taxNote) {
    if (!fits(u.taxNote)) return placed;
    page.taxNote = true;
    cursor.taxNote = true;
    take(u.taxNote);
  }

  if (cursor.schedule < measures.scheduleLines.length) {
    const total = measures.scheduleLines.length;
    let end = cursor.schedule;
    let height: number = u.scheduleHead;
    while (end < total) {
      const next = height + scheduleRowHeight(measures.scheduleLines[end]!);
      if (!fits(next)) break;
      height = next;
      end += 1;
    }
    if (end - cursor.schedule < MIN_SCHEDULE_ROWS) {
      if (force && !placed) {
        end = cursor.schedule + 1;
        height =
          u.scheduleHead +
          scheduleRowHeight(measures.scheduleLines[cursor.schedule]!);
      } else return placed;
    }
    page.schedule = [cursor.schedule, end];
    cursor.schedule = end;
    take(height);
    if (end < total) return placed;
  }

  if (cursor.notes < measures.notesLines) {
    const total = measures.notesLines;
    let end = cursor.notes;
    let height: number = u.notesHead;
    while (end < total && fits(height + u.notesLine)) {
      height += u.notesLine;
      end += 1;
    }
    const minimum = Math.min(MIN_NOTES_LINES, total - cursor.notes);
    if (end - cursor.notes < minimum) {
      if (force && !placed) {
        end = cursor.notes + minimum;
        height = u.notesHead + u.notesLine * minimum;
      } else return placed;
    }
    page.notes = [cursor.notes, end];
    cursor.notes = end;
    take(height);
    if (end < total) return placed;
  }

  if (!cursor.issuedBy) {
    if (!fits(u.issuedBy)) return placed;
    page.issuedBy = true;
    cursor.issuedBy = true;
    take(u.issuedBy);
  }
  return placed;
}

/**
 * The "issued by" closing line never stands alone on a page: if it did not fit after the last
 * other block, hand it that block's last rows (at most two notes lines, or one schedule row, or
 * the tax-mode statement) so it travels with some content.
 */
function keepClosingWithContent(
  page: MutablePage,
  cursor: Cursor,
  measures: PrintMeasures,
) {
  const rest =
    cursor.totals &&
    cursor.taxNote &&
    cursor.schedule >= measures.scheduleLines.length &&
    cursor.notes >= measures.notesLines &&
    !cursor.issuedBy;
  if (!rest) return;
  const [notesFrom, notesTo] = page.notes;
  if (notesTo > notesFrom) {
    const keep =
      notesTo - notesFrom >= 2 + MIN_NOTES_LINES ? notesTo - 2 : notesFrom;
    page.notes = keep === notesFrom ? [0, 0] : [notesFrom, keep];
    cursor.notes = keep;
    return;
  }
  const [scheduleFrom, scheduleTo] = page.schedule;
  if (scheduleTo > scheduleFrom) {
    const keep = scheduleTo - scheduleFrom >= 2 ? scheduleTo - 1 : scheduleFrom;
    page.schedule = keep === scheduleFrom ? [0, 0] : [scheduleFrom, keep];
    cursor.schedule = keep;
    return;
  }
  if (page.taxNote) {
    page.taxNote = false;
    cursor.taxNote = false;
  }
}

export function paginatePrintDocument(
  measures: PrintMeasures,
): readonly PrintPlanPage[] {
  const u = PRINT_UNITS_MM;
  const itemCount = measures.itemLines.length;

  // 1. Item rows, greedily, at least one per page.
  const itemPages: Array<[number, number]> = [];
  {
    let start = 0;
    let index = 0;
    while (start < itemCount || (itemCount === 0 && index === 0)) {
      const capacity = usable() - pageHead(index, measures, true);
      let end = start;
      let used = 0;
      while (end < itemCount) {
        const next = used + rowHeight(measures.itemLines[end]!);
        if (next > capacity && end > start) break;
        used = next;
        end += 1;
      }
      itemPages.push([start, end]);
      start = end;
      index += 1;
      if (itemCount === 0) break;
    }
  }

  const pages: MutablePage[] = itemPages.map(([start, end]) =>
    emptyPage(start, end),
  );
  const itemsUsed = (page: MutablePage, index: number) => {
    let sum = 0;
    for (let item = page.items[0]; item < page.items[1]; item += 1)
      sum += rowHeight(measures.itemLines[item]!);
    return pageHead(index, measures, true) + sum;
  };

  const cursor: Cursor = {
    charge: 0,
    totals: false,
    taxNote: false,
    schedule: 0,
    notes: 0,
    issuedBy: false,
  };

  // 2. Make the totals block share a page with at least one item row where that is possible:
  //    if it does not fit after the last item page's rows, move that page's final row to a new
  //    continued page and put the block there. A summary-only page is added only when even that
  //    cannot work.
  const firstBlock =
    u.finalTop + chargesHeight(measures, 0, measures.chargeLines.length, true);
  {
    const index = pages.length - 1;
    const last = pages[index]!;
    const room = usable() - itemsUsed(last, index);
    if (firstBlock > room && last.items[1] - last.items[0] > 1) {
      const moved = last.items[1] - 1;
      const capacity =
        usable() -
        pageHead(pages.length, measures, true) -
        rowHeight(measures.itemLines[moved]!);
      if (firstBlock <= capacity) {
        last.items = [last.items[0], moved];
        pages.push(emptyPage(moved, moved + 1));
      }
    }
  }

  // 3. Flow the final blocks: first onto the last item page, then onto summary-only pages.
  {
    const index = pages.length - 1;
    const current = pages[index]!;
    placeBlocks(
      current,
      cursor,
      measures,
      usable() - itemsUsed(current, index),
      false,
    );
    keepClosingWithContent(current, cursor, measures);
    let guard = 0;
    while (!blockDone(cursor, measures)) {
      if (guard++ > 1000) throw new Error("Print pagination did not converge.");
      const summary = emptyPage(itemCount, itemCount);
      pages.push(summary);
      placeBlocks(
        summary,
        cursor,
        measures,
        usable() - u.compactHeader - u.continuedLabel,
        true,
      );
      keepClosingWithContent(summary, cursor, measures);
    }
  }

  return pages.map((page) => ({
    items: page.items,
    charges: page.charges,
    totals: page.totals,
    taxNote: page.taxNote,
    schedule: page.schedule,
    notes: page.notes,
    issuedBy: page.issuedBy,
  }));
}

/**
 * The modelled height, in mm, of one planned page (everything inside the 265 mm content area).
 * Used by the unit tests to check that no planned page exceeds the usable height.
 */
export function modelPageHeightMm(
  page: PrintPlanPage,
  index: number,
  measures: PrintMeasures,
) {
  const u = PRINT_UNITS_MM;
  const hasItems = page.items[1] > page.items[0];
  let height = pageHead(index, measures, hasItems || index === 0);
  for (let item = page.items[0]; item < page.items[1]; item += 1)
    height += rowHeight(measures.itemLines[item]!);
  let blocks = 0;
  const add = (blockHeight: number) => {
    blocks += (blocks === 0 ? u.finalTop : u.gap) + blockHeight;
  };
  const hasCharges = page.charges[1] > page.charges[0];
  if (hasCharges || page.totals)
    add(chargesHeight(measures, page.charges[0], page.charges[1], page.totals));
  if (page.taxNote) add(u.taxNote);
  if (page.schedule[1] > page.schedule[0]) {
    let rows = u.scheduleHead as number;
    for (let row = page.schedule[0]; row < page.schedule[1]; row += 1)
      rows += scheduleRowHeight(measures.scheduleLines[row]!);
    add(rows);
  }
  if (page.notes[1] > page.notes[0])
    add(u.notesHead + u.notesLine * (page.notes[1] - page.notes[0]));
  if (page.issuedBy) add(u.issuedBy);
  return height + blocks;
}

export function usablePageHeightMm() {
  return usable();
}
