import Link from "next/link";
import { EmptyState } from "@/components/states";
import { formatMinor } from "@/lib/formatting/money";
import {
  effectiveQuoteState,
  quoteStateLabel,
  dateInTimeZone,
} from "@/lib/quotes/effective-state";
import { requireApplicationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { ListPagination } from "@/components/application/list-pagination";
import {
  listPage,
  listSearch,
  listWindow,
  type ListSearchParams,
} from "@/lib/lists/pagination";
import {
  quoteListQuery,
  quoteListState,
  QUOTE_LIST_STATES,
} from "@/lib/quotes/list-query";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  const context = await requireApplicationContext();
  const supabase = await createClient();
  const params = await searchParams;
  const page = listPage(params.page);
  const search = listSearch(params.q);
  const stateFilter = quoteListState(params.state);
  const instant = new Date();
  const { data, error } = await quoteListQuery(
    supabase,
    {
      organizationId: context.membership.organizationId,
      timeZone: context.membership.organization.timezone,
    },
    params,
    instant,
  );
  if (error) throw new Error("Unable to load tenant quotations.");
  const { rows: quotes, hasMore } = listWindow(data ?? [], page);
  const today = dateInTimeZone(
    instant,
    context.membership.organization.timezone,
  );
  return (
    <section className="destination-page">
      <header className="destination-header">
        <div>
          <p className="eyebrow">Commercial work</p>
          <h1>Quotes</h1>
          <p>Draft, submit, decide and issue exact quotations.</p>
        </div>
        {context.capabilities.includes("quote.create") && (
          <Link className="button button-primary" href="/quotes/new">
            Create quote
          </Link>
        )}
      </header>
      <form className="filter-form">
        <label>
          Search quotes
          <input
            name="q"
            defaultValue={search}
            maxLength={100}
            placeholder="Quotation number or customer"
          />
        </label>
        <label>
          State
          <select name="state" defaultValue={stateFilter}>
            <option value="all">All states</option>
            {QUOTE_LIST_STATES.map((state) => (
              <option key={state} value={state}>
                {quoteStateLabel(state)}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit">
          Apply
        </button>
      </form>
      <div
        className="table-region"
        tabIndex={0}
        role="region"
        aria-label="Quotes table"
      >
        <table>
          <thead>
            <tr>
              <th>Quotation</th>
              <th>Customer</th>
              <th>State</th>
              <th>Issue date</th>
              <th>Valid until</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {quotes?.map((quote) => {
              const customer = Array.isArray(quote.customers)
                ? quote.customers[0]
                : quote.customers;
              const state = effectiveQuoteState(
                quote.state,
                quote.valid_until,
                context.membership.organization.timezone,
                instant,
              );
              const customerName =
                quote.state === "draft"
                  ? customer.name
                  : (quote.customer_name_snapshot ?? customer.name);
              return (
                <tr key={quote.id}>
                  <td>
                    <Link
                      className="record-link mono"
                      href={`/quotes/${encodeURIComponent(quote.number)}`}
                    >
                      {quote.number}
                    </Link>
                  </td>
                  <td>{customerName}</td>
                  <td>
                    <span className="state-label">
                      {quoteStateLabel(state)}
                    </span>
                  </td>
                  <td>{quote.issue_date}</td>
                  <td>{quote.valid_until}</td>
                  <td className="money">
                    {formatMinor(
                      quote.total_minor,
                      quote.currency_code,
                      quote.locale,
                    )}
                  </td>
                </tr>
              );
            })}
            {!quotes?.length && (
              <tr>
                <td colSpan={6} className="table-empty">
                  <EmptyState
                    icon="inbox"
                    title={
                      search || stateFilter !== "all" || page > 1
                        ? "No quotations match this view."
                        : "No quotations yet. Create a draft to begin the commercial record."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        path="/quotes"
        filters={{ q: search, state: stateFilter }}
        page={page}
        count={quotes.length}
        hasMore={hasMore}
      />
      <p className="legal-note">
        Expiry is evaluated on {today} in{" "}
        {context.membership.organization.timezone}. Updated quotations can move
        between pages.
      </p>
    </section>
  );
}
