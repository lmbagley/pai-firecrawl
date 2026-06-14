#!/usr/bin/env bun
// pai-firecrawl — a small, dependency-free bun CLI for the Firecrawl v2 API.
// Markdown by default, --json for raw, every credit cost reported, every
// failure surfaced inline. Run with no args for usage.

import { readFileSync } from "node:fs";
import {
  FirecrawlClient,
  FirecrawlConfigError,
  FirecrawlApiError,
  sleep,
} from "./src/firecrawl.ts";
import {
  jsonOut,
  formatScrape,
  formatMap,
  formatSearch,
  formatPages,
  formatUsage,
  creditFooter,
} from "./src/format.ts";
import type { JobStatusResponse } from "./src/types.ts";

const BOOLEAN_FLAGS = new Set(["json", "only-main", "poll", "scrape"]);

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const name = a.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

const str = (f: ParsedArgs["flags"], k: string): string | undefined =>
  typeof f[k] === "string" ? (f[k] as string) : undefined;
const num = (f: ParsedArgs["flags"], k: string): number | undefined => {
  const v = str(f, k);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`--${k} must be a number, got "${v}"`);
  return n;
};
const bool = (f: ParsedArgs["flags"], k: string): boolean => f[k] === true;
const list = (f: ParsedArgs["flags"], k: string): string[] | undefined => {
  const v = str(f, k);
  return v === undefined ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean);
};

/** Parse a JSON string, naming the source so the error is actionable. */
function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${what} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Read + parse a JSON file, naming the flag and path on any failure. */
function readJsonFile(path: string, what: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read ${what} file "${path}": ${e instanceof Error ? e.message : String(e)}`);
  }
  return parseJson(raw, `${what} file "${path}"`);
}

/** Resolve --timeout (seconds) to ms, rejecting non-positive values up front. */
function timeoutMsFromFlags(f: ParsedArgs["flags"]): number {
  const t = num(f, "timeout");
  if (t === undefined) return 300_000;
  if (t <= 0) throw new Error(`--timeout must be a positive number of seconds, got "${str(f, "timeout")}"`);
  return t * 1000;
}

function out(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}
function progress(text: string): void {
  process.stderr.write(text + "\n");
}

const USAGE = `pai-firecrawl — Firecrawl v2 from the command line (markdown by default)

USAGE
  firecrawl <command> [args] [flags]

COMMANDS
  scrape <url>            Scrape one page to markdown (or html/rawHtml/links/screenshot/json)
  map <url>              Discover all URLs on a site (fast)
  search <query>          Web search; optionally scrape each result
  crawl <url>            Crawl a whole site (async; --poll to wait)
  batch <url...>          Scrape many URLs in one job (async; --poll to wait)
  extract <url...>        LLM structured extraction (--prompt or --schema)
  status <id>            Check an async job (--type crawl|batch)
  cancel <id>            Cancel an async job (--type crawl|batch)
  usage                   Show remaining free-tier credits

COMMON FLAGS
  --json                  Print the raw API JSON instead of markdown
  --format <f>            scrape: markdown|html|rawHtml|links|screenshot|summary|json
  --only-main             scrape: main content only (strip nav/footer)
  --prompt <text>         scrape/extract: natural-language structured extraction
  --schema <file.json>    scrape/extract: JSON schema for structured extraction
  --actions <json>        scrape: browser actions, e.g. '[{"type":"wait","milliseconds":1500}]'
  --search <term>         map: filter discovered URLs
  --limit <n>             cap results (map/search/crawl)
  --scrape                search: also fetch full content of each result
  --sources <a,b>         search: web,news,images (default web)
  --max-depth <n>         crawl: max discovery depth
  --include <a,b>         crawl: only these path globs
  --exclude <a,b>         crawl: skip these path globs
  --poll                  crawl/batch/extract: wait for completion
  --timeout <s>           poll timeout in seconds (default 300)
  --type <kind>           status/cancel: crawl|batch

CONFIG
  Key:  FIRECRAWL_API_KEY env, else ~/.config/firecrawl/api-key (chmod 600)
  Host: FIRECRAWL_API_URL env (for self-hosting), else https://api.firecrawl.dev/v2

EXAMPLES
  firecrawl scrape https://example.com
  firecrawl scrape https://news.site --only-main --format markdown
  firecrawl scrape https://shop.com --prompt "product name and price"
  firecrawl map https://docs.example.com --search api
  firecrawl search "best espresso machines 2026" --limit 5 --scrape
  firecrawl crawl https://docs.example.com --limit 25 --poll
  firecrawl extract https://a.com https://b.com --prompt "company name and pricing"
  firecrawl usage`;

async function pollAndCollect(
  client: FirecrawlClient,
  kind: "crawl" | "batch",
  id: string,
  timeoutMs: number,
): Promise<{ pages: JobStatusResponse["data"]; creditsUsed?: number }> {
  const startedAt = Date.now();
  for (;;) {
    const status = kind === "crawl" ? await client.getCrawl(id) : await client.getBatch(id);
    if (status.status === "completed") {
      let pages = status.data ?? [];
      let next = status.next ?? null;
      let pageGuard = 0;
      while (next) {
        if (Date.now() - startedAt > timeoutMs) {
          throw new Error(`Polling timed out during pagination — job ${id}; resume with: firecrawl status ${id} --type ${kind}`);
        }
        if (++pageGuard > 10_000) {
          throw new Error(`Pagination exceeded ${pageGuard} cursors for job ${id} — aborting (possible cursor loop).`);
        }
        const page = await client.getAbsolute<JobStatusResponse>(next);
        pages = pages.concat(page.data ?? []);
        next = page.next ?? null;
      }
      return { pages, creditsUsed: status.creditsUsed };
    }
    if (status.status === "failed" || status.status === "cancelled") {
      throw new Error(`Job ${id} ${status.status}.`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Polling timed out after ${Math.round(timeoutMs / 1000)}s — job ${id} still "${status.status}". ` +
          `Resume with: firecrawl status ${id} --type ${kind}`,
      );
    }
    progress(`  …${status.status} (${status.completed ?? 0}/${status.total ?? "?"}) — polling`);
    await sleep(2000);
  }
}

async function run(argv: string[]): Promise<void> {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];
  const asJson = bool(flags, "json");

  if (!command || command === "help" || bool(flags, "help")) {
    out(USAGE);
    return;
  }

  const client = new FirecrawlClient();

  switch (command) {
    case "scrape": {
      const url = positionals[1];
      if (!url) throw new Error("scrape needs a URL: firecrawl scrape <url>");
      const prompt = str(flags, "prompt");
      const schemaFile = str(flags, "schema");
      const fmt = str(flags, "format") ?? "markdown";
      if (fmt === "json" && !prompt && !schemaFile) {
        throw new Error("--format json needs --prompt or --schema to tell Firecrawl what to extract");
      }
      let renderFormat = fmt;
      let formats: unknown[];
      if (prompt || schemaFile) {
        const j: Record<string, unknown> = { type: "json" };
        if (prompt) j.prompt = prompt;
        if (schemaFile) j.schema = readJsonFile(schemaFile, "--schema");
        formats = [j];
        renderFormat = "json";
      } else {
        formats = [fmt];
      }
      const payload: Record<string, unknown> = { url, formats };
      if (bool(flags, "only-main")) payload.onlyMainContent = true;
      const actions = str(flags, "actions");
      if (actions) payload.actions = parseJson(actions, "--actions");
      const resp = await client.scrape(payload);
      if (!resp.data) throw new Error(`scrape of ${url} returned success but no data payload`);
      out(asJson ? jsonOut(resp) : formatScrape(resp.data, renderFormat));
      return;
    }

    case "map": {
      const url = positionals[1];
      if (!url) throw new Error("map needs a URL: firecrawl map <url>");
      const payload: Record<string, unknown> = { url };
      const search = str(flags, "search");
      if (search) payload.search = search;
      const limit = num(flags, "limit");
      if (limit !== undefined) payload.limit = limit;
      const resp = await client.map(payload);
      out(asJson ? jsonOut(resp) : formatMap(resp.links ?? []));
      return;
    }

    case "search": {
      const query = positionals.slice(1).join(" ");
      if (!query) throw new Error('search needs a query: firecrawl search "<query>"');
      const payload: Record<string, unknown> = { query };
      const limit = num(flags, "limit");
      if (limit !== undefined) payload.limit = limit;
      const sources = list(flags, "sources");
      if (sources) payload.sources = sources;
      if (bool(flags, "scrape")) payload.scrapeOptions = { formats: ["markdown"] };
      const resp = await client.search(payload);
      out(asJson ? jsonOut(resp) : formatSearch(resp));
      return;
    }

    case "crawl": {
      const url = positionals[1];
      if (!url) throw new Error("crawl needs a URL: firecrawl crawl <url>");
      const payload: Record<string, unknown> = { url };
      const limit = num(flags, "limit");
      if (limit !== undefined) payload.limit = limit;
      const maxDepth = num(flags, "max-depth");
      if (maxDepth !== undefined) payload.maxDiscoveryDepth = maxDepth;
      const include = list(flags, "include");
      if (include) payload.includePaths = include;
      const exclude = list(flags, "exclude");
      if (exclude) payload.excludePaths = exclude;
      const started = await client.startCrawl(payload);
      if (!bool(flags, "poll")) {
        out(
          asJson
            ? jsonOut(started)
            : `crawl started\n  job id: ${started.id}\n  status: firecrawl status ${started.id} --type crawl\n  (add --poll to wait here)`,
        );
        return;
      }
      progress(`crawl ${started.id} started — waiting…`);
      const timeoutMs = timeoutMsFromFlags(flags);
      const { pages, creditsUsed } = await pollAndCollect(client, "crawl", started.id, timeoutMs);
      out(asJson ? jsonOut({ id: started.id, creditsUsed, data: pages }) : formatPages(pages ?? [], creditsUsed));
      return;
    }

    case "batch": {
      const urls = positionals.slice(1);
      if (!urls.length) throw new Error("batch needs URLs: firecrawl batch <url1> <url2> …");
      const payload: Record<string, unknown> = { urls, formats: [str(flags, "format") ?? "markdown"] };
      const started = await client.startBatch(payload);
      if (!bool(flags, "poll")) {
        out(
          asJson
            ? jsonOut(started)
            : `batch started\n  job id: ${started.id}\n  status: firecrawl status ${started.id} --type batch\n  (add --poll to wait here)`,
        );
        return;
      }
      progress(`batch ${started.id} started — waiting…`);
      const timeoutMs = timeoutMsFromFlags(flags);
      const { pages, creditsUsed } = await pollAndCollect(client, "batch", started.id, timeoutMs);
      out(asJson ? jsonOut({ id: started.id, creditsUsed, data: pages }) : formatPages(pages ?? [], creditsUsed));
      return;
    }

    case "extract": {
      // Firecrawl steers structured extraction to /scrape with a json format
      // object (its /v2/extract job endpoint is deprecated and returned no
      // pollable id on this account). So extract = one scrape-json call PER URL,
      // aggregated. This is per-page extraction, NOT the multi-URL agentic
      // /extract — see the README "extract" row for that limitation.
      const urls = positionals.slice(1);
      if (!urls.length) throw new Error("extract needs URLs: firecrawl extract <url…> --prompt <text>");
      const prompt = str(flags, "prompt");
      const schemaFile = str(flags, "schema");
      if (!prompt && !schemaFile) throw new Error("extract needs --prompt <text> or --schema <file.json>");
      const jsonFormat: Record<string, unknown> = { type: "json" };
      if (prompt) jsonFormat.prompt = prompt;
      if (schemaFile) jsonFormat.schema = readJsonFile(schemaFile, "--schema");

      const results: Array<{ url: string; data: unknown; creditsUsed?: number }> = [];
      for (const url of urls) {
        if (urls.length > 1) progress(`  extracting ${url}…`);
        const resp = await client.scrape({ url, formats: [jsonFormat] });
        if (!resp.data) throw new Error(`extract: ${url} returned success but no data payload`);
        const extracted = resp.data.json;
        if (extracted === undefined) progress(`  (no structured data extracted from ${url})`);
        results.push({ url, data: extracted ?? null, creditsUsed: resp.data.metadata?.creditsUsed });
      }

      if (asJson) {
        out(jsonOut(results.length === 1 ? results[0] : results));
        return;
      }
      if (results.length === 1) {
        out(jsonOut(results[0]!.data) + creditFooter(results[0]!.creditsUsed));
      } else {
        const total = results.reduce((s, r) => s + (r.creditsUsed ?? 0), 0);
        out(results.map((r) => `## ${r.url}\n${jsonOut(r.data)}`).join("\n\n") + creditFooter(total));
      }
      return;
    }

    case "status": {
      const id = positionals[1];
      if (!id) throw new Error("status needs a job id: firecrawl status <id> --type crawl|batch");
      const type = str(flags, "type") ?? "crawl";
      const resp = type === "batch" ? await client.getBatch(id) : await client.getCrawl(id);
      if (asJson) {
        out(jsonOut(resp));
      } else {
        const r = resp as JobStatusResponse;
        out(`status: ${r.status}\n  completed: ${r.completed ?? "?"}/${r.total ?? "?"}${creditFooter(r.creditsUsed)}`);
      }
      return;
    }

    case "cancel": {
      const id = positionals[1];
      if (!id) throw new Error("cancel needs a job id: firecrawl cancel <id> --type crawl|batch");
      const type = str(flags, "type") ?? "crawl";
      const resp = type === "batch" ? await client.cancelBatch(id) : await client.cancelCrawl(id);
      out(asJson ? jsonOut(resp) : `cancel ${id}: ${resp.status ?? (resp.success ? "ok" : "failed")}`);
      return;
    }

    case "usage": {
      const resp = await client.creditUsage();
      out(asJson ? jsonOut(resp) : formatUsage(resp));
      return;
    }

    default:
      throw new Error(`unknown command "${command}". Run "firecrawl help" for usage.`);
  }
}

async function main(): Promise<void> {
  try {
    await run(process.argv.slice(2));
  } catch (err) {
    // Inline error surfacing — the actual message, never "check logs".
    if (err instanceof FirecrawlConfigError || err instanceof FirecrawlApiError) {
      process.stderr.write(`error: ${err.message}\n`);
    } else {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    // unknown-command and arg errors should still print usage hint already in message
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}

export { run, pollAndCollect };
