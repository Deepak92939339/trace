export type SearchValue = string | string[] | undefined;
export type ListSearchParams = Record<string, SearchValue>;

export const PAGE_SIZE = 50;
// Existing search RPCs reject offsets above 10,000. Make this boundary visible.
export const MAX_LIST_PAGE = 201;
export const FETCH_SIZE = PAGE_SIZE + 1;

export function singleSearchValue(value: SearchValue): string {
  return typeof value === "string" ? value : "";
}

export function listSearch(value: SearchValue): string {
  return singleSearchValue(value)
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, 100);
}

export function listPage(value: SearchValue): number {
  const raw = singleSearchValue(value);
  if (!/^[1-9]\d{0,8}$/.test(raw)) return 1;
  return Math.min(Number(raw), MAX_LIST_PAGE);
}

export function listWindow<T>(rows: readonly T[], page: number) {
  return {
    rows: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}

export function listHref(
  path: "/customers" | "/catalog" | "/quotes",
  filters: Readonly<Record<string, string>>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  return `${path}${query.size ? `?${query}` : ""}`;
}
