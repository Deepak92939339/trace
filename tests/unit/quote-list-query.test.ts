import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { effectiveQuoteState } from "../../lib/quotes/effective-state";
import { listSearch } from "../../lib/lists/pagination";
import type { Database } from "../../lib/supabase/database.types";
import {
  literalSearchPattern,
  quoteListQuery,
} from "../../lib/quotes/list-query";
import type { ListSearchParams } from "../../lib/lists/pagination";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const instant = new Date("2026-10-25T20:00:00Z");

async function request(params: ListSearchParams, organizationId = org) {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const client = createClient<Database>(
    "https://trace.example.test",
    "public-placeholder",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    },
  );
  const result = await quoteListQuery(
    client,
    { organizationId, timeZone: "Asia/Kolkata" },
    params,
    instant,
  );
  expect(result.error).toBeNull();
  return new URL(String(fetcher.mock.calls[0]![0]));
}

describe("server-side quote list query", () => {
  it("always scopes and bounds the actual SDK request, with a deterministic tie-break", async () => {
    const url = await request({
      page: "22",
      organization_id: "other",
      actor: "admin",
    });
    expect(url.searchParams.get("organization_id")).toBe(`eq.${org}`);
    expect(url.searchParams.get("offset")).toBe("1050");
    expect(url.searchParams.get("limit")).toBe("51");
    expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
    expect(url.searchParams.has("actor")).toBe(false);
    const outsider = await request({}, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(outsider.searchParams.get("organization_id")).not.toBe(
      url.searchParams.get("organization_id"),
    );
  });
  it("combines text and effective expiry in one logic parameter using organization-local today", async () => {
    const url = await request({ q: "Asha", state: "expired" });
    const logic = url.searchParams.get("or")!;
    expect(logic).toContain('number.imatch."Asha"');
    expect(logic).toContain('customer_name_snapshot.imatch."Asha"');
    expect(logic).toContain("and(state.eq.draft,search_customer.not.is.null)");
    expect(logic).toContain(
      "and(state.neq.draft,customer_name_snapshot.is.null,search_customer.not.is.null)",
    );
    expect(logic).toContain(
      "state.in.(draft,waiting,approved),valid_until.lt.2026-10-26",
    );
    expect(url.searchParams.getAll("or")).toHaveLength(1);
    expect(url.searchParams.get("search_customer.name")).toBe("imatch.Asha");
    expect(url.searchParams.get("select")).toContain(
      "customers!inner(name),search_customer:customers()",
    );
  });
  it("keeps expired drafts out of the active draft filter but never expires issued or rejected records", async () => {
    const draft = await request({ state: "draft" });
    expect(draft.searchParams.get("state")).toBe("eq.draft");
    expect(draft.searchParams.get("valid_until")).toBe("gte.2026-10-26");
    for (const state of ["issued", "rejected"]) {
      const url = await request({ state });
      expect(url.searchParams.get("state")).toBe(`eq.${state}`);
      expect(url.searchParams.has("valid_until")).toBe(false);
    }
  });
  it("quotes filter grammar and treats regex, LIKE and wildcard punctuation literally", async () => {
    const term = 'A%_*.[x](y)|z\\ ",state.eq.issued)';
    const pattern = literalSearchPattern(term);
    const regex = new RegExp(pattern, "i");
    expect(regex.test(`prefix ${term.toUpperCase()} suffix`)).toBe(true);
    expect(regex.test("any arbitrary name")).toBe(false);
    const url = await request({ q: term });
    expect(url.searchParams.get("search_customer.name")).toBe(
      `imatch.${pattern}`,
    );
    expect(url.searchParams.get("or")).toContain(
      `number.imatch.${JSON.stringify(pattern)}`,
    );
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.get("organization_id")).toBe(`eq.${org}`);
  });
  it("normalizes malformed arrays, page bounds and unknown state without taking authority from the URL", async () => {
    const url = await request({
      q: ["a", "b"],
      state: ["issued", "draft"],
      page: "99999999",
    });
    expect(url.searchParams.has("or")).toBe(false);
    expect(url.searchParams.has("state")).toBe(false);
    expect(url.searchParams.get("offset")).toBe("10000");
  });
});

describe("adversarial search requests", () => {
  const terms = [
    "%",
    "_",
    "\\",
    ",",
    "(",
    ")",
    "*",
    ".",
    "x".repeat(300),
    "or=(state.eq.issued)",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ];
  it.each(terms)("keeps filter structure for %s", async (term) => {
    const url = await request({
      q: term,
      state: "expired",
      organization_id: term,
    });
    const safe = await request({ q: "safe", state: "expired" });
    const pattern = JSON.stringify(literalSearchPattern(listSearch(term)));
    expect([...url.searchParams.keys()]).toEqual([...safe.searchParams.keys()]);
    for (const [key, value] of safe.searchParams) {
      const actual = url.searchParams.get(key)!;
      expect(
        key === "search_customer.name"
          ? actual.replace(literalSearchPattern(listSearch(term)), "safe")
          : actual.split(pattern).join('"safe"'),
      ).toBe(value);
    }
    expect(
      new RegExp(literalSearchPattern(listSearch(term)), "i").test(
        listSearch(term),
      ),
    ).toBe(true);
    console.log(JSON.stringify({ input: term, method: "GET", url: url.href }));
  });
  it("expires after the organization's last valid local day while UTC remains on that date", () => {
    const before = new Date("2026-10-26T18:29:59Z");
    const after = new Date("2026-10-26T18:30:00Z");
    expect(
      effectiveQuoteState("draft", "2026-10-26", "Asia/Kolkata", before),
    ).toBe("draft");
    expect(
      effectiveQuoteState("draft", "2026-10-26", "Asia/Kolkata", after),
    ).toBe("expired");
    expect(effectiveQuoteState("draft", "2026-10-26", "UTC", after)).toBe(
      "draft",
    );
  });
});
