/** Presentation only: existing pinning/immutability rules remain authoritative. */
export function layoutNotice(input: {
  canPrint: boolean;
  customLayout: boolean;
  unavailable?: boolean;
}): string {
  if (input.unavailable)
    return "Document layout could not be checked. A standard preview is shown. Retry before preparing the final document.";
  if (input.customLayout)
    return "Document layout finalized. This revision keeps its captured template and brand when organization defaults change.";
  if (input.canPrint)
    return "Standard document layout finalized. This revision keeps the standard layout even if a default template is selected later.";
  return "Standard document preview. A print-authorized user's first view or download finalizes the layout; later template changes do not alter a finalized revision.";
}
