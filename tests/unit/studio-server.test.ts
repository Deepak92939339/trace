import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ getApplicationContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
import { DEFAULT_BRAND } from "../../lib/studio/layout-schema";
import { SYSTEM_TEMPLATES } from "../../lib/studio/templates";
import {
  getBrand,
  listTemplates,
  pinRevisionLayout,
  readAsset,
  studioContext,
} from "../../lib/studio/server";
import { studioFailure, StudioError } from "../../lib/studio/errors";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  REV = "00000000-0000-4000-8000-000000000001",
  ASSET = "00000000-0000-4000-8000-000000000002";
const record = {
  kind: "studio",
  revision_id: REV,
  organization_id: ORG,
  layout: SYSTEM_TEMPLATES[0].layout,
  brand: DEFAULT_BRAND,
  layout_hash: "a".repeat(64),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    user: { id: REV },
    capabilities: ["template.read", "quote.print"],
    membership: { organizationId: ORG, organization: { id: ORG } },
  });
});
describe("Studio server trust boundaries", () => {
  it("rejects unauthenticated and capability-less callers before any RPC", async () => {
    mocks.context.mockResolvedValue(null);
    await expect(studioContext("template.read")).rejects.toMatchObject({
      status: 401,
    });
    mocks.context.mockResolvedValue({
      capabilities: [],
      membership: { organizationId: ORG },
    });
    await expect(getBrand()).rejects.toMatchObject({ status: 403 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects another organization's result even if a backend response is wrong", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: REV,
          organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Other",
          base_template_key: "classic",
          layout: SYSTEM_TEMPLATES[0].layout,
          version: 1,
          is_default: false,
          archived_at: null,
        },
      ],
      error: null,
    });
    await expect(listTemplates()).rejects.toMatchObject({
      code: "studio_data_invalid",
    });
  });
  it("passes only the revision ID to pin; repeat renders use the returned row", async () => {
    mocks.rpc.mockResolvedValue({ data: record, error: null });
    const pinned = await pinRevisionLayout(REV);
    expect(pinned?.layout).toEqual(record.layout);
    expect(mocks.rpc).toHaveBeenCalledWith("pin_revision_layout", {
      p_revision_id: REV,
    });
  });
  it("logs and falls back for an invalid pinned layout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mocks.rpc.mockResolvedValue({
        data: { ...record, layout: { ...record.layout, v: 2 } },
        error: null,
      });
      expect(await pinRevisionLayout(REV)).toBeNull();
      expect(warn).toHaveBeenCalledWith("studio_pinned_layout_invalid", {
        revisionId: REV,
      });
    } finally {
      warn.mockRestore();
    }
  });
  it("neutralizes a hostile logo created through a direct RPC", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const bytes = Buffer.from('<svg onload="x"/>');
      mocks.rpc.mockImplementation(async (name: string) => ({
        data:
          name === "pin_revision_layout"
            ? { ...record, brand: { ...DEFAULT_BRAND, logo_asset_id: ASSET } }
            : {
                id: ASSET,
                mime: "image/svg+xml",
                base64: bytes.toString("base64"),
                byte_length: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
              },
        error: null,
      }));
      const pinned = await pinRevisionLayout(REV);
      expect(pinned?.logo).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it("does not silently omit a logo on a database failure", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "pin_revision_layout"
        ? {
            data: {
              ...record,
              brand: { ...DEFAULT_BRAND, logo_asset_id: ASSET },
            },
            error: null,
          }
        : { data: null, error: { code: "XX000", message: "offline" } },
    );
    await expect(pinRevisionLayout(REV)).rejects.toMatchObject({
      code: "studio_unavailable",
    });
  });
  it("rejects a tampered asset digest", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        id: ASSET,
        mime: "image/png",
        base64: "AA==",
        byte_length: 1,
        sha256: "0".repeat(64),
      },
      error: null,
    });
    await expect(readAsset(ASSET)).rejects.toMatchObject({
      code: "studio_data_invalid",
    });
  });
  it("maps version conflict, rate limit and permission errors to useful messages", () => {
    expect(
      studioFailure({ code: "40001", message: "template_version_conflict" }),
    ).toMatchObject({ status: 409 });
    expect(
      studioFailure({ code: "54000", message: "studio_export_rate_limited" }),
    ).toMatchObject({ status: 429 });
    expect(studioFailure({ code: "42501" })).toMatchObject({ status: 403 });
    expect(
      studioFailure(new StudioError("studio_asset_in_use")).message,
    ).toContain("printed revision");
  });
});
