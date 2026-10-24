/* eslint-disable @next/next/no-img-element -- Embedded validated data URLs must work identically offline and in print. */
import { studioPageCss } from "../../lib/studio/page-css.ts";
import type { CSSProperties } from "react";
import { brandIsValid, layoutIsValid, type Block, type Brand, type Column, type Layout } from "../../lib/studio/layout-schema.ts";
import type { PrintData } from "../../lib/studio/print-data.ts";
import { resolveTokens, tokenParts } from "../../lib/studio/tokens.ts";
import { assetDataUrl } from "../../lib/studio/assets.ts";

export type LogoBytes = { mime: string; bytes: Uint8Array };
export const STUDIO_PRINT_CSS = `
.studio-document{color:#17212b;background:#fbfaf6;font-family:var(--font-sans);font-size:10pt;line-height:1.5;page:studio-page;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.studio-document *{box-sizing:border-box}
.studio-document p{margin:0 0 3mm;white-space:pre-wrap;overflow-wrap:anywhere}
.studio-document h1{font-family:var(--font-serif);font-size:25pt;line-height:1.15;margin:8mm 0 4mm}
.studio-document h2{font-size:9pt;margin:0 0 3mm;letter-spacing:.06em;text-transform:uppercase}
.studio-document .studio-block{margin-bottom:5mm;overflow-wrap:anywhere}
.studio-document[data-density=compact]{font-size:8.5pt;line-height:1.35}
.studio-document[data-density=compact] .studio-block{margin-bottom:3mm}
.studio-document[data-density=airy] .studio-block{margin-bottom:7mm}
.studio-document[data-font=serif]{font-family:var(--font-serif)}
.studio-document[data-font=mono-accent] h2,.studio-document[data-font=mono-accent] th{font-family:var(--font-mono)}
.studio-document table{border-collapse:collapse;width:100%;font-size:8.5pt;table-layout:auto}
.studio-document th{text-align:left;text-transform:uppercase;font-size:7pt;letter-spacing:.04em;color:#586475}
.studio-document td,.studio-document th{padding:2mm 1mm;border-bottom:1px solid #d9d3c6;overflow-wrap:anywhere}
.studio-document thead{display:table-header-group}
.studio-document .studio-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.studio-document td.studio-num+td:not(.studio-num),.studio-document th.studio-num+th:not(.studio-num){padding-left:3mm}
.studio-document tr{break-inside:avoid;page-break-inside:avoid}
.studio-document .studio-pair,.studio-document .studio-meta{display:flex;gap:6mm;justify-content:space-between}
.studio-document .studio-pair section{flex:1;min-width:0}
.studio-document .studio-pair[data-stack=true],.studio-document .studio-meta[data-stack=true]{display:block}
.studio-document .studio-meta{font-size:8pt;flex-wrap:wrap}
.studio-document small{display:block;color:#586475;font-size:8pt}
.studio-document .studio-rule{border-bottom:1px solid #d9d3c6;padding-bottom:3mm}
.studio-document[data-rules=none] .studio-rule{border-bottom:0}
.studio-document[data-rules=bold] .studio-rule{border-bottom-width:2px}
.studio-document .studio-band{background:#17212b;color:#fff;padding:5mm}
.studio-document .studio-band small{color:#e7ecf1}
.studio-document .studio-zebra tbody tr:nth-child(even){background:#f1efe7}
.studio-document .studio-boxed td,.studio-document .studio-boxed th{border:1px solid #d9d3c6}
.studio-document .studio-totals,.studio-document .studio-acceptance{break-inside:avoid;page-break-inside:avoid}
.studio-document .studio-totals{margin-left:auto;width:55%}
.studio-document .studio-totals[data-full=true]{width:100%}
.studio-document .studio-totals div{display:flex;justify-content:space-between;gap:4mm;padding:1mm 1mm}
.studio-document .studio-grand{border-top:2px solid var(--studio-primary);font-weight:700;font-size:12pt}
.studio-document .studio-cover{padding:6mm 0 4mm;margin-bottom:6mm;break-inside:avoid}
.studio-document .studio-cover[data-tone=dark]{background:#17212b;color:#fff;padding:12mm}
.studio-document .studio-cover[data-tone=dark] small{color:#e7ecf1}
.studio-document .studio-cover-top{display:flex;justify-content:space-between;align-items:center;gap:6mm;font-size:8pt;letter-spacing:.06em;text-transform:uppercase;color:#586475}
.studio-document .studio-cover-top>span:first-child{display:flex;align-items:center;gap:3mm;min-width:0}
.studio-document .studio-cover[data-tone=dark] .studio-cover-top{color:#e7ecf1}
.studio-document .studio-cover-logo{height:8mm;width:auto;max-width:30mm}
.studio-document .studio-cover-meta{display:flex;gap:6mm;justify-content:space-between;flex-wrap:wrap;margin-top:6mm;padding-top:4mm;border-top:1px solid #d9d3c6;font-size:8pt}
.studio-document .studio-cover[data-tone=dark] .studio-cover-meta{border-top-color:#586475}
.studio-document .studio-cover-meta strong{display:block}
.studio-document .studio-token{background:#e8f1eb;color:#216b46;border-radius:3px;padding:1px 3px;font-size:8pt}
.studio-document .studio-footer{font-size:7pt;color:#586475;display:flex;justify-content:space-between;gap:4mm}
.studio-document .studio-logo{object-fit:contain;max-width:100%;display:block}
.studio-document .studio-acceptance{border-left:3px solid var(--studio-accent);padding-left:4mm}
.studio-document .studio-tint{background:#f1efe7;padding:4mm}
.studio-document[data-corners=rounded] .studio-tint,.studio-document[data-corners=rounded] .studio-band{border-radius:3mm}
.studio-preview{display:block!important;width:100%;padding:8mm}
@media print{.studio-document{display:block!important;padding:0!important;background:white}.studio-document .studio-token{background:transparent;color:inherit}}
`;
// The adapter's due text already names a fixed date ("Due on 2026-12-23"); only append the date when it is not in the text.
const whenText = (p: { when: string; date: string }) => (p.date && !p.when.includes(p.date) ? `${p.when} ${p.date}` : p.when);
const NUMERIC = new Set<Column>(["qty", "rate", "amount"]);
const LABELS: Record<Column, string> = { sku: "SKU", description: "Description", spec: "Specification", qty: "Qty", unit: "Unit", rate: "Rate", tax_code: "Tax code", amount: "Amount" };
export function DocumentRenderer({ layout, brand, data, logo, fields = false, preview = false, includePageCss = true }: {
  layout: Layout; brand: Brand; data: PrintData; logo?: LogoBytes | null; fields?: boolean; preview?: boolean; includePageCss?: boolean;
}) {
  if (!layoutIsValid(layout) || !brandIsValid(brand)) return null;
  // Every render re-sanitizes bytes, including assets created through a direct RPC.
  const logoUrl = logo ? assetDataUrl(logo.mime, logo.bytes) : null;
  const text = (value: string) => fields ? tokenParts(value, data.tokens).map((p, i) => p.type === "token" ? <span className="studio-token" key={i} title={p.known ? "Field" : "Unknown field"}>{p.name}</span> : p.value) : resolveTokens(value, data.tokens);
  const meta = (labels = true, stack = false, selected: readonly string[] = ["number", "revision", "date", "valid_until", "currency"]) => <div className="studio-meta" data-stack={stack}>{selected.map(key => <div key={key}>{labels && <small>{({ number: "Reference", revision: "Revision", date: "Issued", valid_until: "Valid until", currency: "Currency" } as Record<string,string>)[key]}</small>}<strong>{({ number: data.quote.number, revision: data.quote.revision, date: data.quote.date, valid_until: data.quote.validUntil, currency: data.quote.currency } as Record<string,string>)[key]}</strong></div>)}</div>;
  const renderBlock = (b: Block) => {
    switch (b.type) {
      case "letterhead": return <header className={`studio-rule ${b.props.variant === "band" ? "studio-band" : ""}`} style={{ textAlign: b.props.align === "center" ? "center" : "left" }}><div className="studio-pair" data-stack={b.props.align === "left" || b.props.align === "center"}><div>{logoUrl && <img className="studio-logo" src={logoUrl} alt={`${data.seller.name} logo`} style={{ height: "12mm" }} />}<strong style={{ color: b.props.variant === "band" ? "inherit" : brand.primary }}>{data.seller.name}</strong></div><div>{b.props.showAddress !== false && <small>{data.seller.address}</small>}{b.props.showContact !== false && <small>{data.seller.contact}</small>}</div></div></header>;
      case "logo": return logoUrl ? <div style={{ textAlign: b.props.align ?? "left" }}><img className="studio-logo" src={logoUrl} alt={`${data.seller.name} logo`} style={{ height: `${b.props.height ?? 34}px`, display: "inline-block" }} /></div> : null;
      case "cover": return <section className="studio-cover" data-tone={b.props.tone ?? "light"}><div className="studio-cover-top"><span>{logoUrl && <img className="studio-logo studio-cover-logo" src={logoUrl} alt={`${data.seller.name} logo`} />}{data.seller.name}</span><span>{data.quote.number}</span></div><h1>{text(b.props.title ?? "{{quote.title}}")}</h1><p>{text(b.props.subtitle ?? "Prepared for {{customer.name}}")}</p><p>{text(b.props.abstract ?? "")}</p>{b.props.meta !== "none" && <div className="studio-cover-meta"><div><small>Prepared for</small><strong>{data.customer.name}</strong></div><div><small>Reference</small><strong>{data.quote.number} · {data.quote.revision}</strong></div><div><small>Valid until</small><strong>{data.quote.validUntil}</strong></div></div>}</section>;
      case "quote_meta": return meta(b.props.labels !== false, b.props.direction === "stack", b.props.fields);
      case "parties": return <div className={`studio-pair ${b.props.tint ? "studio-tint" : ""}`} data-stack={b.props.layout === "stacked"}><section><small>From</small><strong>{data.seller.name}</strong><p>{data.seller.address}</p><small>{data.seller.taxId}</small></section><section><small>Prepared for</small><strong>{data.customer.name}</strong><p>{data.customer.address}</p><small>{data.customer.contact} · {data.customer.email}</small><small>{data.customer.taxId}</small></section></div>;
      case "intro": case "notes": case "free_text": return <p style={{ textAlign: b.type === "free_text" ? b.props.align ?? "left" : "left" }}>{text(b.props.text ?? (b.type === "notes" ? data.quote.notes : ""))}</p>;
      case "line_items": { const columns = b.props.columns ?? ["description", "qty", "unit", "rate", "amount"]; return <table className={`${b.props.zebra ? "studio-zebra" : ""} ${b.props.boxed ? "studio-boxed" : ""}`}><thead><tr>{columns.map(c => <th key={c} className={NUMERIC.has(c) ? "studio-num" : undefined}>{LABELS[c]}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id}>{columns.map(c => <td key={c} className={NUMERIC.has(c) ? "studio-num" : undefined}>{item[c]}{c === "description" && b.props.specs && item.spec && <small>{item.spec}</small>}</td>)}</tr>)}</tbody></table>; }
      case "totals": return <section className="studio-totals" data-full={b.props.layout === "full"}><div><span>Subtotal</span><span>{data.totals.subtotal}</span></div><div><span>Discount</span><span>− {data.totals.discount}</span></div><div><span>{data.quote.taxLabel}</span><span>{data.totals.tax}</span></div>{b.props.showExtras !== false && <div><span>Charges</span><span>{data.totals.charges}</span></div>}<div className="studio-grand"><span>Total {data.quote.currency}</span><span>{data.totals.grand}</span></div><small>{data.quote.taxMode === "inclusive" ? "Line prices include tax." : "Tax is added to line prices."}</small></section>;
      case "extra_charges": return data.charges.length ? <section><h2>Extra charges</h2><table><thead><tr><th>Charge</th><th className="studio-num">Amount</th><th className="studio-num">Tax</th><th className="studio-num">Total</th></tr></thead><tbody>{data.charges.map(c => <tr key={c.id}><td>{c.description}</td><td className="studio-num">{c.amount}</td><td className="studio-num">{c.tax}</td><td className="studio-num">{c.total}</td></tr>)}</tbody></table></section> : null;
      case "payment_schedule": return data.paymentSchedule.length ? <section><h2>Payment schedule</h2>{b.props.layout === "cards" ? <div className="studio-pair">{data.paymentSchedule.map((p, i) => <section className="studio-tint" key={i}><strong>{p.label}</strong><p>{p.share} · {p.amount}</p>{b.props.showNotes !== false && <small>{whenText(p)}</small>}</section>)}</div> : <table><thead><tr><th>Milestone</th><th>When</th><th className="studio-num">Share</th><th className="studio-num">Amount</th></tr></thead><tbody>{data.paymentSchedule.map((p, i) => <tr key={i}><td>{p.label}</td><td>{whenText(p)}</td><td className="studio-num">{p.share}</td><td className="studio-num">{p.amount}</td></tr>)}</tbody></table>}</section> : null;
      case "terms": return (b.props.text ?? "").trim() ? <section style={{ columnCount: String(b.props.columns ?? 1) }}><h2>Terms</h2><p>{text(b.props.text ?? "")}</p></section> : null;
      case "acceptance": return <section className="studio-acceptance"><h2>Acceptance</h2><p>{text(b.props.text ?? "Use the secure buyer link to record your decision against this revision.")}</p>{b.props.showExpiry !== false && <small>Valid until {data.quote.validUntil}</small>}</section>;
      case "spacer": return <div style={{ height: `${b.props.height ?? 18}px`, borderBottom: b.props.rule ? "1px solid #d9d3c6" : "none" }} />;
      case "footer": return preview ? <footer className={`studio-footer ${b.props.rule !== false ? "studio-rule" : ""}`}><span>{text(b.props.text ?? "")}{brand.footer_line && <><br />{brand.footer_line}</>}<br />{brand.registration_line}</span><span>{text(b.props.right ?? "")}</span></footer> : null;
    }
  };
  return <section className={`print-document studio-document ${preview ? "studio-preview" : ""}`} aria-label={`Document layout for ${data.quote.number}`} data-font={brand.font} data-density={layout.style.density} data-rules={layout.style.rules} data-corners={layout.style.corners} style={{ "--studio-primary": brand.primary, "--studio-accent": brand.accent } as CSSProperties}>
    <style>{STUDIO_PRINT_CSS + (!preview && includePageCss ? studioPageCss(layout,brand,data.tokens) : "")}</style>
    {layout.blocks.filter(b => preview || b.type !== "footer").map(b => <div className="studio-block" key={b.id} data-block-id={b.id}>{renderBlock(b)}</div>)}
  </section>;
}
