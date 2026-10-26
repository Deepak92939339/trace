import Link from "next/link";
import { listHref, MAX_LIST_PAGE, PAGE_SIZE } from "@/lib/lists/pagination";

export function ListPagination({
  path,
  filters,
  page,
  count,
  hasMore,
}: {
  path: "/customers" | "/catalog" | "/quotes";
  filters: Readonly<Record<string, string>>;
  page: number;
  count: number;
  hasMore: boolean;
}) {
  const offset = (page - 1) * PAGE_SIZE;
  return (
    <nav className="list-pagination" aria-label="Results pagination">
      <p aria-live="polite">
        {count
          ? `Showing ${offset + 1}–${offset + count}`
          : "No results on this page"}
        {` · Page ${page}`}
      </p>
      <div className="button-row">
        {page > 1 && (
          <Link className="button" href={listHref(path, filters, page - 1)}>
            Previous page
          </Link>
        )}
        {hasMore && page < MAX_LIST_PAGE && (
          <Link className="button" href={listHref(path, filters, page + 1)}>
            Next page
          </Link>
        )}
        {page > 1 && !count && (
          <Link className="button" href={listHref(path, filters, 1)}>
            First page
          </Link>
        )}
      </div>
      {hasMore && page === MAX_LIST_PAGE && (
        <p className="legal-note">
          More matches exist. Refine your search to browse beyond the first
          10,050 matches.
        </p>
      )}
    </nav>
  );
}
