import { getApplicationContext } from "@/lib/auth/context";
import {
  issuedActorForRevision,
  printPropsFromRevision,
  verifiedSealedSnapshot,
} from "@/lib/quotes/issued-print-props";
import { createClient } from "@/lib/supabase/server";
import {
  ensureQuotePdf,
  QuotePdfError,
  type EnsurePdfDeps,
  type RegisteredPdf,
} from "./ensure-pdf";
import {
  PdfIntegrityError,
  pdfDownloadPath,
  pdfDownloadResponse,
} from "./download-response";
import { QUOTE_PDF_BUCKET, quotePdfFilename } from "./path";
import { buildPrintHtml } from "./print-html";
import {
  claimRender,
  finishRender,
  PrivilegedWriterUnavailableError,
  readObject,
  registerPdf,
  storeObject,
} from "./privileged-writer";
import { renderPdf } from "./render";

function failure(
  status: number,
  code: string,
  message: string,
  retryAfterSeconds?: number,
) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfterSeconds) headers.set("Retry-After", String(retryAfterSeconds));
  return Response.json({ error: { code, message } }, { status, headers });
}

function revisionNumberFrom(value: string) {
  return /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : null;
}

/**
 * GET /quotes/[number]/revisions/[revisionNumber]/pdf
 *
 *  - quote.read is required for any response; the lookup is scoped to the caller's own
 *    organization through RLS, so another tenant's quote is simply "not found".
 *  - An already-registered PDF is returned to anyone with quote.read.
 *  - A missing PDF is rendered once, and only for a holder of quote.print.
 *  - The PDF is served from this origin (200, attachment): the stored bytes are read with the
 *    caller's own session and checked against the register. The browser is never redirected
 *    to Supabase Storage. `?format=json` returns this route's own path as `url`, plus the
 *    registered hash and size, so the page can show progress and errors before downloading.
 */
export async function handleQuotePdfRequest(
  request: Request,
  params: { number: string; revisionNumber: string },
) {
  try {
    const context = await getApplicationContext();
    if (!context)
      return failure(401, "unauthenticated", "Sign in to download this PDF.");
    if (!context.membership)
      return failure(403, "forbidden", "Your account has no organization.");
    if (!context.capabilities.includes("quote.read"))
      return failure(403, "forbidden", "You cannot read quotations.");

    const revisionNumber = revisionNumberFrom(params.revisionNumber);
    let quoteNumber: string;
    try {
      quoteNumber = decodeURIComponent(params.number);
    } catch {
      return failure(404, "not_found", "Quotation not found.");
    }
    if (!revisionNumber)
      return failure(404, "not_found", "Quotation revision not found.");

    const organization = context.membership.organization;
    const supabase = await createClient();
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, number")
      .eq("organization_id", organization.id)
      .eq("number", quoteNumber)
      .maybeSingle();
    if (quoteError) throw new Error("quote lookup failed");
    if (!quote) return failure(404, "not_found", "Quotation not found.");

    const { data: revision, error: revisionError } = await supabase
      .from("quote_revisions")
      .select("id, revision_number, state, snapshot_hash")
      .eq("organization_id", organization.id)
      .eq("quote_id", quote.id)
      .eq("revision_number", revisionNumber)
      .maybeSingle();
    if (revisionError) throw new Error("revision lookup failed");
    if (!revision)
      return failure(404, "not_found", "Quotation revision not found.");
    if (revision.state !== "issued" || !revision.snapshot_hash)
      return failure(
        409,
        "pdf_revision_not_renderable",
        "Only an issued, sealed quotation revision has a PDF.",
      );

    const deps: EnsurePdfDeps = {
      async readRegistered(revisionId): Promise<RegisteredPdf | null> {
        const { data, error } = await supabase
          .from("quote_revision_pdfs")
          .select(
            "revision_id, storage_path, sha256, byte_length, snapshot_hash, generated_at",
          )
          .eq("revision_id", revisionId)
          .maybeSingle();
        if (error) throw new Error("register lookup failed");
        return data
          ? {
              revisionId: data.revision_id,
              storagePath: data.storage_path,
              sha256: data.sha256,
              byteLength: data.byte_length,
              snapshotHash: data.snapshot_hash,
              generatedAt: data.generated_at,
            }
          : null;
      },
      claim: claimRender,
      finish: finishRender,
      readObject,
      storeObject,
      registerPdf,
      async render() {
        const { data: sealed, error } = await supabase
          .from("quote_revisions")
          .select("snapshot, snapshot_hash, issued_at")
          .eq("id", revision.id)
          .single();
        if (error || !sealed?.issued_at)
          throw new Error("sealed revision lookup failed");
        const snapshot = verifiedSealedSnapshot(sealed);
        const { data: activity, error: activityError } = await supabase
          .from("quote_activity")
          .select("event_type, actor_name_snapshot, safe_metadata")
          .eq("organization_id", organization.id)
          .eq("quote_id", quote.id)
          .eq("event_type", "quote.revision_issue")
          .eq("safe_metadata->>revision_id", revision.id);
        if (activityError) throw new Error("issue activity lookup failed");
        const html = await buildPrintHtml({
          props: printPropsFromRevision({
            snapshot,
            issuedAt: sealed.issued_at,
            issuedActor: issuedActorForRevision(activity ?? [], revision.id),
            timeZone: organization.timezone,
          }),
          revisionNumber: revision.revision_number,
        });
        return renderPdf(html);
      },
      sleep: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      now: () => Date.now(),
    };

    const pdf = await ensureQuotePdf(
      {
        organizationId: organization.id,
        revisionId: revision.id,
        userId: context.user.id,
        canGenerate: context.capabilities.includes("quote.print"),
      },
      deps,
    );

    const filename = quotePdfFilename(quote.number, revision.revision_number);

    if (new URL(request.url).searchParams.get("format") === "json")
      return Response.json(
        {
          url: pdfDownloadPath(request.url),
          filename,
          pdf: {
            revisionId: pdf.revisionId,
            sha256: pdf.sha256,
            byteLength: pdf.byteLength,
            snapshotHash: pdf.snapshotHash,
            generatedAt: pdf.generatedAt,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );

    // Same authorization as before: the object policy lets a member with quote.read read only a
    // registered file of their own organization, so the user's session (not the service role)
    // reads it.
    const { data: stored, error: downloadError } = await supabase.storage
      .from(QUOTE_PDF_BUCKET)
      .download(pdf.storagePath);
    if (downloadError || !stored)
      return failure(
        503,
        "pdf_unavailable",
        "The PDF exists but could not be read. Try again shortly.",
        2,
      );
    return pdfDownloadResponse(
      new Uint8Array(await stored.arrayBuffer()),
      pdf,
      filename,
    );
  } catch (error) {
    if (error instanceof QuotePdfError)
      return failure(
        error.status,
        error.code,
        error.message,
        error.retryAfterSeconds,
      );
    if (error instanceof PdfIntegrityError) {
      console.error("quote_pdf_integrity_mismatch");
      return failure(
        500,
        "pdf_unavailable",
        "The PDF could not be prepared. Try again shortly.",
      );
    }
    if (error instanceof PrivilegedWriterUnavailableError)
      return failure(
        503,
        "pdf_generation_not_configured",
        "PDF generation is not configured on this server. Existing PDFs can still be downloaded.",
      );
    console.error("quote_pdf_request_failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown",
    });
    return failure(
      500,
      "pdf_unavailable",
      "The PDF could not be prepared. Try again shortly.",
    );
  }
}
