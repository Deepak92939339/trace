import { ProductForm } from "@/components/catalog/product-form";
import { EmptyState } from "@/components/states";
import { CatalogImport } from "@/components/catalog/catalog-import";
import { formatMinor } from "@/lib/formatting/money";
import { requireApplicationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import styles from "@/components/catalog/catalog.module.css";
import { ListPagination } from "@/components/application/list-pagination";
import {
  FETCH_SIZE,
  listPage,
  listSearch,
  listWindow,
  PAGE_SIZE,
  singleSearchValue,
  type ListSearchParams,
} from "@/lib/lists/pagination";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  const context = await requireApplicationContext();
  const canReadMargin = context.capabilities.includes("margin.read");
  const query = await searchParams;
  const search = listSearch(query.q);
  const page = listPage(query.page);
  const requestedState = singleSearchValue(query.state);
  const state =
    requestedState === "inactive"
      ? "inactive"
      : requestedState === "all"
        ? "all"
        : "active";
  const supabase = await createClient();
  const [{ data, error }, { data: taxProfiles }] = await Promise.all([
    supabase.rpc("search_products", {
      p_organization_id: context.membership.organizationId,
      p_query: search,
      p_state: state,
      p_limit: FETCH_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase
      .from("tax_profiles")
      .select("id, code, label")
      .eq("organization_id", context.membership.organizationId)
      .eq("active", true)
      .order("code"),
  ]);
  if (error) throw new Error("Unable to load the tenant-scoped catalog.");
  const { rows: products, hasMore } = listWindow(data ?? [], page);
  const unitCostsResult =
    canReadMargin && products.length
      ? await supabase
          .from("product_unit_costs")
          .select("id, unit_cost_minor")
          .eq("organization_id", context.membership.organizationId)
          .in(
            "id",
            products.map((product) => product.id),
          )
      : { data: null, error: null };
  if (unitCostsResult.error)
    throw new Error("Unable to load product costs for this catalog page.");

  const costByProductId = new Map<string, number | null>();
  if (canReadMargin && unitCostsResult.data) {
    for (const row of unitCostsResult.data) {
      if (row.id) {
        costByProductId.set(row.id, row.unit_cost_minor);
      }
    }
  }

  return (
    <section className="destination-page">
      <header className="destination-header">
        <div>
          <p className="eyebrow">Commercial source</p>
          <h1>Catalog</h1>
          <p>
            Organization products, units, prices and configured tax treatments.
          </p>
        </div>
      </header>
      <div className="destination-tools">
        <form className="filter-form">
          <label>
            Search catalog
            <input name="q" defaultValue={search} maxLength={100} />
          </label>
          <label>
            State
            <select name="state" defaultValue={state}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </label>
          <button className="button" type="submit">
            Apply
          </button>
        </form>
        {context.capabilities.includes("catalog.manage") && (
          <details name="catalog-tool">
            <summary className="button">Create product</summary>
            <ProductForm
              taxProfiles={taxProfiles ?? []}
              currencyCode={
                context.membership.organization.default_currency_code
              }
              commandId={crypto.randomUUID()}
              canReadMargin={canReadMargin}
            />
          </details>
        )}
        {context.capabilities.includes("catalog.import") && (
          <details name="catalog-tool">
            <summary className="button">Import CSV</summary>
            <CatalogImport />
          </details>
        )}
      </div>
      <div
        className="table-region"
        tabIndex={0}
        role="region"
        aria-label="Catalog table"
      >
        <table className={styles.catalogTable}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Unit price</th>
              {canReadMargin && <th role="presentation">Cost</th>}
              <th>Tax profile</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {products?.map((product) => {
              const costMinor = costByProductId.get(product.id);
              return (
                <tr key={product.id}>
                  <td className="mono" data-label="SKU">
                    {product.sku}
                  </td>
                  <td data-label="Description">{product.description}</td>
                  <td data-label="Unit">
                    {product.unit_code}
                    {product.quantity_precision > 0
                      ? ` · ${product.quantity_precision} decimals`
                      : ""}
                  </td>
                  <td className="money" data-label="Unit price">
                    {formatMinor(
                      product.unit_price_minor,
                      product.currency_code,
                      context.membership.organization.default_locale,
                    )}
                  </td>
                  {canReadMargin && (
                    <td role="presentation" className="money" data-label="Cost">
                      {typeof costMinor === "number"
                        ? formatMinor(
                            costMinor,
                            product.currency_code,
                            context.membership.organization.default_locale,
                          )
                        : "—"}
                    </td>
                  )}
                  <td data-label="Tax profile">{product.tax_code}</td>
                  <td data-label="State">
                    {product.active ? "Active" : "Inactive"}
                  </td>
                </tr>
              );
            })}
            {!products?.length && (
              <tr>
                <td colSpan={canReadMargin ? 7 : 6} className="table-empty">
                  <EmptyState
                    icon="search"
                    title="No catalog products match this view."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        path="/catalog"
        filters={{ q: search, state }}
        page={page}
        count={products.length}
        hasMore={hasMore}
      />
      <p className="legal-note">
        Tax profiles are organization configuration for demonstration and
        calculation; they are not universal legal tax advice.
      </p>
    </section>
  );
}
