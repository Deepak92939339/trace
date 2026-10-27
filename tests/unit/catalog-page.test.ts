import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireApplicationContext: mocks.context,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/components/catalog/product-form", () => ({
  ProductForm: () => null,
}));
vi.mock("@/components/catalog/catalog-import", () => ({
  CatalogImport: () => null,
}));
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", props),
}));
import CatalogPage from "../../app/(application)/catalog/page";

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const products = Array.from({ length: 51 }, (_, index) => ({
  id: `product-${index}`,
  sku: `SKU-${index}`,
  description: `Product ${index}`,
  active: true,
  unit_code: "EA",
  unit_price_minor: 10000,
  currency_code: "INR",
  quantity_precision: 0,
  tax_profile_id: null,
}));
let from: ReturnType<typeof vi.fn>,
  rpc: ReturnType<typeof vi.fn>,
  costs: ReturnType<typeof vi.fn>;
function context(capabilities: string[], role: string) {
  mocks.context.mockResolvedValue({
    capabilities,
    membership: {
      role,
      organizationId,
      organization: { default_currency_code: "INR" },
    },
  });
}
beforeEach(() => {
  costs = vi.fn().mockResolvedValue({
    data: [{ id: "product-0", unit_cost_minor: 987654321 }],
    error: null,
  });
  from = vi.fn((table: string) =>
    table === "product_unit_costs"
      ? { select: () => ({ eq: () => ({ in: costs }) }) }
      : {
          select: () => ({
            eq: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }),
          }),
        },
  );
  rpc = vi.fn().mockResolvedValue({ data: products, error: null });
  mocks.client.mockResolvedValue({ rpc, from });
});

describe("paged Catalog cost boundary", () => {
  it.each(["reviewer", "operator"])(
    "%s without margin.read receives no cost fields or cost query",
    async (role) => {
      context(["catalog.read"], role);
      const html = renderToStaticMarkup(
        await CatalogPage({ searchParams: Promise.resolve({ page: "2" }) }),
      );
      expect(rpc).toHaveBeenCalledWith("search_products", {
        p_organization_id: organizationId,
        p_query: "",
        p_state: "active",
        p_limit: 51,
        p_offset: 50,
      });
      expect(from).not.toHaveBeenCalledWith("product_unit_costs");
      expect(costs).not.toHaveBeenCalled();
      expect(html).not.toMatch(/Unit cost|unit_cost_minor|987654321|Margin/);
      expect(html).toContain("SKU-49");
      expect(html).not.toContain("SKU-50");
    },
  );
  it("margin reader fetches only the 50 displayed IDs, excluding the lookahead", async () => {
    context(["catalog.read", "margin.read"], "manager");
    await CatalogPage({ searchParams: Promise.resolve({ page: "2" }) });
    expect(costs).toHaveBeenCalledExactlyOnceWith(
      "id",
      products.slice(0, 50).map((product) => product.id),
    );
  });
});
