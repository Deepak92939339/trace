import type { RecipientQuoteViewModel } from "@/lib/public-quotes/view-model";

export function stateLabel(quote: RecipientQuoteViewModel) {
  if (quote.responseType === "accepted") return "Accepted";
  if (quote.responseType === "declined") return "Declined";
  if (quote.responseType === "change_requested")
    return "Change request recorded";
  return quote.effectiveState === "issued" ? "Issued" : quote.effectiveState;
}
