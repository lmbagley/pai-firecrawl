// Output rendering. Markdown is the default surface; --json is opt-in and
// handled by the caller (raw passthrough). Every credit-consuming result ends
// with a one-line credit footer.

import type {
  ScrapeData,
  MapLink,
  SearchResponse,
  CreditUsageResponse,
  ScrapeMetadata,
  CatalogueItem,
  ContractOption,
  FindToolsData,
  SearchTool,
  AlexandriaResult,
} from "./types.ts";
import { credits } from "./alexandria.ts";

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
  const tools = formatSearchTools(resp.data.tools);
  if (tools) sections.push(tools);
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

// ---- Alexandria ------------------------------------------------------------

function price(item: CatalogueItem): string {
  if (typeof item.creditsCost !== "number") return "price not listed";
  return item.perRecord ? `${credits(item.creditsCost)} per record` : credits(item.creditsCost);
}

function renderFields(label: string, fields: ContractOption[] | undefined): string[] {
  if (!fields || !fields.length) return [];
  return [
    `   ${label}:`,
    ...fields.map((f) => `     - ${f.name}${f.type ? ` (${f.type})` : ""}${f.required ? " required" : ""}${f.about ? `: ${f.about}` : ""}`),
  ];
}

/** Render one page of the Alexandria catalogue (categories, providers, tools, or a contract). */
export function formatFindTools(data: FindToolsData, creditsCost: number): string {
  const lines: string[] = [];
  const items = data.items ?? [];
  if (!items.length) {
    lines.push(`(no matching tools${data.suggestion ? ` — ${data.suggestion}` : ""})`);
  }
  items.forEach((it, i) => {
    if (it.provider && it.capability) {
      lines.push(`${i + 1}. ${it.provider}/${it.capability}${it.name ? ` — ${it.name}` : ""}  [${price(it)}]`);
    } else {
      lines.push(`${i + 1}. ${it.id ?? "(unnamed)"}`);
    }
    if (it.description) lines.push(`   ${it.description}`);
    if (it.requiresOneOf?.length) {
      lines.push(`   needs one of: ${it.requiresOneOf.map((g) => `[${g.join(" | ")}]`).join(", ")}`);
    }
    lines.push(...renderFields("options", it.options));
    if (it.response) {
      if (it.response.about) lines.push(`   returns: ${it.response.about}`);
      if (it.response.key) lines.push(`   response key: ${it.response.key}`);
      lines.push(...renderFields("fields", it.response.fields));
    }
  });
  const shown = items.length;
  const header = `Alexandria catalogue — level: ${data.level ?? "?"}${typeof data.total === "number" ? `, ${shown} of ${data.total}` : ""}`;
  const nextOffset = data.next?.options && typeof data.next.options.offset === "number" ? data.next.options.offset : undefined;
  const more = data.next ? `\n\nmore: repeat with --offset ${nextOffset ?? "(see --json next)"}` : "";
  return `${header}\n\n${lines.join("\n")}${more}${creditFooter(creditsCost)}`;
}

/** Render the tools block of an Alexandria-enabled search. */
export function formatSearchTools(tools: SearchTool[] | undefined): string {
  if (!tools || !tools.length) return "";
  const lines = tools.map(
    (t, i) => `${i + 1}. ${t.provider}/${t.capability}${t.description ? `\n   ${t.description}` : ""}`,
  );
  return (
    `## Alexandria tools\n${lines.join("\n")}\n\n` +
    `   Check the price and inputs before running: firecrawl find-tools --providers <p> --capabilities <c>`
  );
}

/**
 * Render one executed Alexandria capability. Live shape (2026-09-29): the rows
 * are in `data`; `records` is the billed record COUNT, not the rows.
 */
export function formatAlexandriaResult(item: AlexandriaResult, creditsCost: number): string {
  const meta: string[] = [];
  if (typeof item.records === "number") meta.push(`records: ${item.records}`);
  if (item.upstreamStatus !== undefined) meta.push(`upstream status: ${String(item.upstreamStatus)}`);
  const head = `# ${item.provider}/${item.capability}${meta.length ? `\n${meta.join(" · ")}` : ""}`;
  return `${head}\n\n${jsonOut(item.data ?? null)}${creditFooter(creditsCost)}`;
}
