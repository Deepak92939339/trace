const MESSAGES: Record<string, string> = {
  studio_forbidden: "Your role cannot perform this action in this workspace.",
  studio_layout_invalid:
    "This layout is invalid. Check its blocks and fields before saving.",
  studio_template_invalid:
    "Use a template name of 1–80 characters and one of the built-in designs.",
  template_version_conflict:
    "Someone saved a newer version. Reload the template before applying your changes.",
  template_limit_reached:
    "This workspace has 25 active templates. Archive one before adding another.",
  asset_limit_reached:
    "This workspace has eight logos. Delete an unused logo before uploading another.",
  studio_asset_invalid:
    "Use PNG, JPEG or WebP up to 512 KB, or SVG up to 128 KB.",
  studio_asset_magic_invalid:
    "The file contents do not match its image type. Export the logo again and retry.",
  studio_asset_svg_invalid:
    "This SVG uses unsupported or unsafe content. Use a simple SVG or export it as PNG.",
  studio_asset_in_use:
    "This logo is used by the current brand or a printed revision. A printed logo must remain available for reprints.",
  studio_brand_invalid:
    "Check the brand colours, font and text lengths before saving.",
  studio_revision_not_issued:
    "Only an issued, sealed quotation revision can use a document layout.",
  studio_export_rate_limited:
    "An export was requested recently. Wait 60 seconds before trying again.",
  studio_export_too_large:
    "The workspace exceeds 200 issued revisions or 50 MB. Download quotations individually.",
  studio_data_invalid:
    "The Studio returned an unsupported record. Reload and ask an administrator to check the migration.",
  studio_unavailable:
    "The Studio could not load. Try again, or ask an administrator to check the database migration.",
  studio_not_found:
    "The issued quotation revision was not found in this workspace.",
  studio_authentication_required: "Sign in to use Document Studio.",
};
export class StudioError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(MESSAGES[code] ?? MESSAGES.studio_unavailable);
    this.name = "StudioError";
    this.code = code;
    this.status = status;
  }
}
export function studioFailure(error: unknown): StudioError {
  if (error instanceof StudioError) return error;
  const source =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string })
      : {};
  const key = Object.keys(MESSAGES).find((k) => source.message === k);
  if (key)
    return new StudioError(
      key,
      source.code === "42501"
        ? 403
        : key === "studio_export_rate_limited"
          ? 429
          : key === "template_version_conflict"
            ? 409
            : 400,
    );
  if (source.code === "42501") return new StudioError("studio_forbidden", 403);
  return new StudioError("studio_unavailable", 503);
}
export function studioErrorResponse(error: unknown) {
  const failure = studioFailure(error),
    headers = new Headers({ "Cache-Control": "private, no-store" });
  if (failure.status === 429) headers.set("Retry-After", "60");
  return Response.json(
    { error: { code: failure.code, message: failure.message } },
    { status: failure.status, headers },
  );
}
