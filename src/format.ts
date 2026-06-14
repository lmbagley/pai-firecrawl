// Output rendering. Markdown is the default surface; --json is opt-in and
// handled by the caller (raw passthrough). Every credit-consuming result ends
// with a one-line credit footer.

import type {
  ScrapeData,
  MapLink,
  SearchResponse,
  CreditUsageResponse,
  ScrapeMetadata,
} from "./types.ts";

export function jsonOut(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function creditFooter(credits: number | undefined): string {
  return typeof credits === "number" ? `\n\n— credits used: ${credits}` : "";
}

/** Pull a single scrape format out of the data object as text. */
export function formatScrape(data: ScrapeData, format: string): string {
  const meta = data.metadata;
  const footer = creditFooter(meta?.creditsUsed);
  let body: string;
  switch (format) {
    case "html":
      body = data.html ?? "(no html returned — did you pass --format html?)";
      break;
    case "rawHtml":
      body = data.rawHtml ?? "(no rawHtml returned)";
      break;
    case "links":
      body = (data.links ?? []).join("\n") || "(no links returned)";
      break;
    case "screenshot":
      body = data.screenshot ?? "(no screenshot returned)";
      break;
    case "summary":
      body = data.summary ?? "(no summary returned)";
      break;
    case "json":
      body = data.json !== undefined ? jsonOut(data.json) : "(no structured json returned)";
      break;
    case "markdown":
    default:
      body = data.markdown ?? "(no markdown returned)";
      break;
  }
  return body + footer;
}

export function scrapeHeader(meta: ScrapeMetadata | undefined): string {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.title) parts.push(meta.title);
  if (meta.sourceURL || meta.url) parts.push(`<${meta.sourceURL ?? meta.url}>`);
  if (typeof meta.statusCode === "number") parts.push(`[${meta.statusCode}]`);
  return parts.length ? `# ${parts.join(" ")}\n\n` : "";
}

export function formatMap(links: MapLink[]): string {
  if (!links.length) return "(no URLs discovered)";
  const lines = links.map((l) => {
    return l.title ? `${l.url}\n    ${l.title}` : l.url;
  });
  return `${links.length} URLs:\n\n${lines.join("\n")}`;
}

export function formatSearch(resp: SearchResponse): string {
  const sections: string[] = [];
  const render = (label: string, results?: SearchResponse["data"]["web"]) => {
    if (!results || !results.length) return;
    const lines = results.map((r, i) => {
      const head = `${i + 1}. ${r.title ?? r.url}\n   ${r.url}`;
      const desc = r.description ? `\n   ${r.description}` : "";
      const content = r.markdown ? `\n\n   ${r.markdown.slice(0, 500).replace(/\n/g, "\n   ")}…` : "";
      return head + desc + content;
    });
    sections.push(`## ${label}\n${lines.join("\n\n")}`);
  };
  render("Web", resp.data.web);
  render("News", resp.data.news);
  render("Images", resp.data.images);
  const body = sections.length ? sections.join("\n\n") : "(no results)";
  return body + creditFooter(resp.creditsUsed);
}

/** Concatenate crawled/batch pages into one markdown document. */
export function formatPages(pages: ScrapeData[], creditsUsed?: number): string {
  if (!pages.length) return "(no pages returned)" + creditFooter(creditsUsed);
  const docs = pages.map((p) => {
    const header = scrapeHeader(p.metadata);
    return header + (p.markdown ?? "(no markdown)");
  });
  return `${pages.length} pages\n\n${docs.join("\n\n---\n\n")}` + creditFooter(creditsUsed);
}

export function formatUsage(resp: CreditUsageResponse): string {
  const d = resp.data;
  const lines = [
    `Remaining credits: ${d.remainingCredits ?? "?"} / ${d.planCredits ?? "?"}`,
  ];
  if (d.billingPeriodStart || d.billingPeriodEnd) {
    lines.push(`Billing window:    ${d.billingPeriodStart ?? "?"} → ${d.billingPeriodEnd ?? "?"}`);
  }
  return lines.join("\n");
}
