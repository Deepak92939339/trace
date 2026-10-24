import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/quote-pdf/render";
import { buildPrintHtml } from "@/lib/quote-pdf/print-html";
import { pdfDownloadPath, pdfDownloadResponse } from "@/lib/quote-pdf/download-response";
import { QUOTE_PDF_BUCKET, quotePdfFilename } from "@/lib/quote-pdf/path";
import { loadIssuedDocument } from "./issued-document.ts";
/** Auth/tenant/issued checks run again. This module only SELECTs, downloads or renders bytes. */
export async function readOnlyIssuedPdf(request: Request, params: {number:string;revisionNumber:string}) {
  const doc = await loadIssuedDocument(params);
  const client = await createClient();
  const {data:registered,error} = await client.from("quote_revision_pdfs").select("revision_id,storage_path,sha256,byte_length,snapshot_hash,generated_at").eq("revision_id",doc.revision.id).maybeSingle();
  if (error) throw new Error("PDF register lookup failed");
  const filename = quotePdfFilename(doc.quote.number,doc.revision.revision_number);
  let bytes: Uint8Array;
  if (registered) {
    const {data,error:downloadError} = await client.storage.from(QUOTE_PDF_BUCKET).download(registered.storage_path);
    if (downloadError || !data) throw new Error("PDF download failed");
    bytes = new Uint8Array(await data.arrayBuffer());
    if (registered.snapshot_hash !== doc.revision.snapshot_hash || bytes.length !== registered.byte_length || createHash("sha256").update(bytes).digest("hex") !== registered.sha256) throw new Error("PDF integrity mismatch");
  } else {
    // Transient output; no claim, register, activity or storage writes.
    bytes = await renderPdf(await buildPrintHtml({props:doc.props,revisionNumber:doc.revision.revision_number,studio:doc.studio}));
  }
  const pdf = {revisionId:doc.revision.id,storagePath:registered?.storage_path ?? "",snapshotHash:doc.revision.snapshot_hash!,sha256:createHash("sha256").update(bytes).digest("hex"),byteLength:bytes.length,generatedAt:registered?.generated_at ?? doc.revision.issued_at!};
  if (new URL(request.url).searchParams.get("format") === "json") return Response.json({url:pdfDownloadPath(request.url),filename,pdf},{headers:{"Cache-Control":"private, no-store"}});
  return pdfDownloadResponse(bytes,pdf,filename);
}
