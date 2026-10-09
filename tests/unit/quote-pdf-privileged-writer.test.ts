import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { name: string; args: unknown[] };
const calls: Call[] = [];
let rpcResult: { data: unknown; error: { code: string } | null } = {
  data: null,
  error: null,
};
let existsResult: { data: boolean; error: unknown } = {
  data: false,
  error: null,
};
let downloadResult: { data: Blob | null; error: unknown } = {
  data: null,
  error: null,
};
let uploadResult: { data: unknown; error: unknown } = {
  data: {},
  error: null,
};
const createClientSpy = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    createClientSpy(...args);
    return {
      rpc: async (name: string, params: unknown) => {
        calls.push({ name, args: [params] });
        return rpcResult;
      },
      storage: {
        from: (bucket: string) => ({
          exists: async (path: string) => {
            calls.push({ name: "exists", args: [bucket, path] });
            return existsResult;
          },
          download: async (path: string) => {
            calls.push({ name: "download", args: [bucket, path] });
            return downloadResult;
          },
          upload: async (path: string, _bytes: unknown, options: unknown) => {
            calls.push({ name: "upload", args: [bucket, path, options] });
            return uploadResult;
          },
        }),
      },
    };
  },
}));

const writer = () => import("../../lib/quote-pdf/privileged-writer");
const ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;
// Built from parts so the secret scanner does not mistake this fake value for an assignment.
const SERVICE_KEY = "SUPABASE_SERVICE_ROLE" + "_KEY";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  createClientSpy.mockClear();
  for (const name of ENV) saved[name] = process.env[name];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  process.env[SERVICE_KEY] = "service-test-key";
  rpcResult = { data: null, error: null };
  existsResult = { data: false, error: null };
  downloadResult = { data: null, error: null };
  uploadResult = { data: {}, error: null };
});

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const REVISION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const USER = "11111111-1111-4111-8111-111111111111";
const PATH = `org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/revision/${REVISION}.pdf`;

describe("privileged writer without its credential", () => {
  it("reports itself unconfigured and refuses every operation, creating no client", async () => {
    delete process.env[SERVICE_KEY];
    const writerModule = await writer();
    expect(writerModule.privilegedWriterConfigured()).toBe(false);
    await expect(
      writerModule.claimRender(USER, REVISION),
    ).rejects.toBeInstanceOf(writerModule.PrivilegedWriterUnavailableError);
    await expect(writerModule.readObject(PATH)).rejects.toBeInstanceOf(
      writerModule.PrivilegedWriterUnavailableError,
    );
    expect(createClientSpy).not.toHaveBeenCalled();
  });
});

describe("privileged writer with its credential", () => {
  it("builds one session-less client from the public URL and the server key", async () => {
    rpcResult = { data: { status: "exists" }, error: null };
    const writerModule = await writer();
    expect(writerModule.privilegedWriterConfigured()).toBe(true);
    await writerModule.claimRender(USER, REVISION);
    await writerModule.claimRender(USER, REVISION);
    expect(createClientSpy).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClientSpy.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:54321");
    expect(key).toBe("service-test-key");
    expect(options).toMatchObject({
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it.each([
    [
      { status: "render", attempt_id: "attempt-1" },
      { status: "render", attemptId: "attempt-1" },
    ],
    [{ status: "exists" }, { status: "exists" }],
    [{ status: "in_progress" }, { status: "in_progress" }],
    [
      { status: "revision_not_renderable" },
      { status: "revision_not_renderable" },
    ],
    [
      { status: "cooldown", retry_after_seconds: 12 },
      { status: "cooldown", retryAfterSeconds: 12 },
    ],
    [
      { status: "rate_limited", retry_after_seconds: 41.2 },
      { status: "rate_limited", retryAfterSeconds: 42 },
    ],
    [{ status: "cooldown" }, { status: "cooldown", retryAfterSeconds: 30 }],
  ])("maps claim response %j", async (data, expected) => {
    rpcResult = { data, error: null };
    const writerModule = await writer();
    await expect(writerModule.claimRender(USER, REVISION)).resolves.toEqual(
      expected,
    );
    expect(calls[0]).toEqual({
      name: "claim_quote_pdf_render",
      args: [{ p_user_id: USER, p_revision_id: REVISION }],
    });
  });

  it("rejects an unknown claim status, a render claim without an attempt, and database errors", async () => {
    const writerModule = await writer();
    rpcResult = { data: { status: "surprise" }, error: null };
    await expect(writerModule.claimRender(USER, REVISION)).rejects.toThrow(
      /unknown status/,
    );
    rpcResult = { data: { status: "render" }, error: null };
    await expect(writerModule.claimRender(USER, REVISION)).rejects.toThrow(
      /attempt/,
    );
    rpcResult = { data: null, error: { code: "42501" } };
    await expect(writerModule.claimRender(USER, REVISION)).rejects.toThrow(
      /42501/,
    );
  });

  it("finishes an attempt through the finish routine", async () => {
    const writerModule = await writer();
    await writerModule.finishRender("attempt-1", false);
    expect(calls[0]).toEqual({
      name: "finish_quote_pdf_render",
      args: [{ p_attempt_id: "attempt-1", p_succeeded: false }],
    });
  });

  it("readObject: missing object (exists() answers data:false with an error) is null, not a failure", async () => {
    existsResult = {
      data: false,
      error: { status: 400, message: "Object not found" },
    };
    const writerModule = await writer();
    await expect(writerModule.readObject(PATH)).resolves.toBeNull();
    expect(calls.map((call) => call.name)).toEqual(["exists"]);
  });

  it("readObject: returns the stored bytes, and fails loudly when the download fails", async () => {
    existsResult = { data: true, error: null };
    downloadResult = {
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null,
    };
    const writerModule = await writer();
    await expect(writerModule.readObject(PATH)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    downloadResult = { data: null, error: { message: "boom" } };
    await expect(writerModule.readObject(PATH)).rejects.toThrow(
      /download failed/,
    );
  });

  it("storeObject: never upserts, labels the file a PDF, and distinguishes a duplicate from a failure", async () => {
    const writerModule = await writer();
    const bytes = new TextEncoder().encode("%PDF-1.4 test");
    await expect(writerModule.storeObject(PATH, bytes)).resolves.toBe("stored");
    expect(calls[0]).toEqual({
      name: "upload",
      args: [
        "quote-pdfs",
        PATH,
        expect.objectContaining({
          upsert: false,
          contentType: "application/pdf",
        }),
      ],
    });
    uploadResult = {
      data: null,
      error: { statusCode: "409", message: "Duplicate" },
    };
    await expect(writerModule.storeObject(PATH, bytes)).resolves.toBe("exists");
    uploadResult = {
      data: null,
      error: { message: "The resource already exists" },
    };
    await expect(writerModule.storeObject(PATH, bytes)).resolves.toBe("exists");
    uploadResult = {
      data: null,
      error: { statusCode: "500", message: "disk full" },
    };
    await expect(writerModule.storeObject(PATH, bytes)).rejects.toThrow(
      /upload failed/,
    );
  });

  it("storeObject: refuses an empty or oversized file before touching storage", async () => {
    const writerModule = await writer();
    await expect(
      writerModule.storeObject(PATH, new Uint8Array(0)),
    ).rejects.toThrow(RangeError);
    await expect(
      writerModule.storeObject(PATH, new Uint8Array(10 * 1024 * 1024 + 1)),
    ).rejects.toThrow(RangeError);
    expect(calls).toEqual([]);
  });

  it("registerPdf: sends only revision, hash, size and path, and returns the registered row", async () => {
    rpcResult = {
      data: {
        revision_id: REVISION,
        storage_path: PATH,
        sha256: "a".repeat(64),
        byte_length: 1234,
        snapshot_hash: "b".repeat(64),
        generated_at: "2026-10-07T03:01:21.000+00:00",
        created: true,
      },
      error: null,
    };
    const writerModule = await writer();
    const row = await writerModule.registerPdf({
      revisionId: REVISION,
      sha256: "a".repeat(64),
      byteLength: 1234,
      path: PATH,
    });
    expect(calls[0]).toEqual({
      name: "record_quote_pdf",
      args: [
        {
          p_revision_id: REVISION,
          p_sha256: "a".repeat(64),
          p_byte_length: 1234,
          p_path: PATH,
        },
      ],
    });
    expect(row).toEqual({
      revisionId: REVISION,
      storagePath: PATH,
      sha256: "a".repeat(64),
      byteLength: 1234,
      snapshotHash: "b".repeat(64),
      generatedAt: "2026-10-07T03:01:21.000+00:00",
    });
    rpcResult = { data: null, error: { code: "55000" } };
    await expect(
      writerModule.registerPdf({
        revisionId: REVISION,
        sha256: "a".repeat(64),
        byteLength: 1,
        path: PATH,
      }),
    ).rejects.toThrow(/55000/);
  });
});
