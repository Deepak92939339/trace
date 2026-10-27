import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  issuedActorForRevision,
  printPropsFromRevision,
  verifiedSealedSnapshot,
} from "@/lib/quotes/issued-print-props";
import { buildPrintHtml } from "@/lib/quote-pdf/print-html";
import { quotePdfFilename } from "@/lib/quote-pdf/path";
import {
  pinRevisionLayout,
  readRevisionLayout,
  studioContext,
} from "./server.ts";
import { StudioError } from "./errors.ts";

export async function loadIssuedDocument(
  params: { number: string; revisionNumber: string },
  purpose: "print" | "preview" | "export" = "print",
) {
  const context = await studioContext("quote.read");
  await studioContext("template.read");
  const organization = context.membership.organization;
  if (
    !/^[1-9][0-9]{0,5}$/.test(params.revisionNumber) ||
    params.number.length > 200
  )
    throw new StudioError("studio_not_found", 404);
  // Dynamic route params have already been decoded by Next. No second decoding of user text.
  const client = await createClient();
  const { data: quote, error: quoteError } = await client
    .from("quotes")
    .select("id,number")
    .eq("organization_id", organization.id)
    .eq("number", params.number)
    .maybeSingle();
  if (quoteError) throw new StudioError("studio_unavailable", 503);
  if (!quote) throw new StudioError("studio_not_found", 404);
  const { data: revision, error: revisionError } = await client
    .from("quote_revisions")
    .select("id,revision_number,state,snapshot,snapshot_hash,issued_at")
    .eq("organization_id", organization.id)
    .eq("quote_id", quote.id)
    .eq("revision_number", Number(params.revisionNumber))
    .maybeSingle();
  if (revisionError) throw new StudioError("studio_unavailable", 503);
  if (!revision) throw new StudioError("studio_not_found", 404);
  if (
    revision.state !== "issued" ||
    !revision.issued_at ||
    !revision.snapshot_hash ||
    !revision.snapshot
  )
    throw new StudioError("studio_revision_not_issued", 409);
  const snapshot = verifiedSealedSnapshot(revision);
  const { data: activity, error: activityError } = await client
    .from("quote_activity")
    .select("event_type,actor_name_snapshot,safe_metadata")
    .eq("organization_id", organization.id)
    .eq("quote_id", quote.id)
    .eq("event_type", "quote.revision_issue")
    .eq("safe_metadata->>revision_id", revision.id);
  if (activityError) throw new StudioError("studio_unavailable", 503);
  return {
    quote,
    revision,
    props: printPropsFromRevision({
      snapshot,
      issuedAt: revision.issued_at,
      issuedActor: issuedActorForRevision(activity ?? [], revision.id),
      timeZone: organization.timezone,
    }),
    studio:
      purpose === "preview"
        ? null
        : purpose === "export"
          ? await readRevisionLayout(revision.id)
          : context.capabilities.includes("quote.print")
            ? await pinRevisionLayout(revision.id)
            : await readRevisionLayout(revision.id),
  };
}
export async function issuedHtml(
  params: { number: string; revisionNumber: string },
  purpose: "print" | "export" = "print",
) {
  const doc = await loadIssuedDocument(params, purpose);
  const html = await buildPrintHtml({
    props: doc.props,
    revisionNumber: doc.revision.revision_number,
    studio: doc.studio,
  });
  // Downloaded HTML is useful on screen as well as print; the PDF's existing CSS stays intact.
  const visible = html.replace(
    "</head>",
    "<style>@media screen{.print-document{display:block!important;max-width:210mm;margin:12mm auto;padding:12mm;box-sizing:border-box}.print-page{break-after:page}}</style></head>",
  );
  return {
    html: visible,
    filename: quotePdfFilename(
      doc.quote.number,
      doc.revision.revision_number,
    ).replace(/\.pdf$/, ".html"),
  };
}

/** HTML for the workspace export: read-only, so exporting never pins a layout. */
export const issuedHtmlReadOnly = (params: {
  number: string;
  revisionNumber: string;
}) => issuedHtml(params, "export");

/** Studio preview never pins a layout or generates a PDF. */
export async function recentIssuedPreviews() {
  const context = await studioContext("template.read");
  await studioContext("quote.read");
  const client = await createClient(),
    organizationId = context.membership.organizationId;
  const { data: revisions, error } = await client
    .from("quote_revisions")
    .select("id,quote_id,revision_number,issued_at")
    .eq("organization_id", organizationId)
    .eq("state", "issued")
    .not("snapshot_hash", "is", null)
    .order("issued_at", { ascending: false })
    .limit(20);
  if (error) throw new StudioError("studio_unavailable", 503);
  if (!revisions?.length) return [];
  const { data: quotes, error: quoteError } = await client
    .from("quotes")
    .select("id,number")
    .eq("organization_id", organizationId)
    .in("id", [...new Set(revisions.map((r) => r.quote_id))]);
  if (quoteError) throw new StudioError("studio_unavailable", 503);
  const numbers = new Map((quotes ?? []).map((q) => [q.id, q.number]));
  return revisions.flatMap((r) => {
    const number = numbers.get(r.quote_id);
    return number
      ? [
          {
            id: r.id,
            number,
            revisionNumber: r.revision_number,
            issuedAt: r.issued_at,
          },
        ]
      : [];
  });
}
