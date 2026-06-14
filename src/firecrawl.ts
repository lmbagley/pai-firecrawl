// Firecrawl v2 API client — config resolution, a single request helper that
// surfaces every failure verbatim (never swallows to a log), and one typed
// method per endpoint.

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import type {
  ScrapeResponse,
  MapResponse,
  SearchResponse,
  JobStartResponse,
  JobStatusResponse,
  CreditUsageResponse,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://api.firecrawl.dev/v2";

/** Thrown when no API key / bad configuration is found. Caller prints .message. */
export class FirecrawlConfigError extends Error {
  override name = "FirecrawlConfigError";
}

/** Thrown on any non-2xx response or transport failure. Carries the raw body. */
export class FirecrawlApiError extends Error {
  override name = "FirecrawlApiError";
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Resolve the API key with zero PAI coupling, in priority order:
 *   1. FIRECRAWL_API_KEY env var
 *   2. ~/.config/firecrawl/api-key   (generic XDG location)
 *   3. ~/.config/pai/firecrawl/api-key (PAI convenience fallback, harmless elsewhere)
 */
export function resolveApiKey(
  env: Record<string, string | undefined> = process.env,
  candidateFiles: string[] = [
    join(homedir(), ".config", "firecrawl", "api-key"),
    join(homedir(), ".config", "pai", "firecrawl", "api-key"),
  ],
): string {
  const fromEnv = env.FIRECRAWL_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  for (const path of candidateFiles) {
    if (existsSync(path)) {
      const key = readFileSync(path, "utf8").trim();
      if (key) return key;
    }
  }
  throw new FirecrawlConfigError(
    "No Firecrawl API key found.\n" +
      "  Set FIRECRAWL_API_KEY, or write your key to ~/.config/firecrawl/api-key (chmod 600).\n" +
      "  Get a free key (1,000 pages/mo, no card) at https://www.firecrawl.dev/app/api-keys",
  );
}

/** Base URL: FIRECRAWL_API_URL override (for self-hosting) else cloud default. */
export function resolveBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.FIRECRAWL_API_URL?.trim();
  return (fromEnv || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export interface ClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class FirecrawlClient {
  readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: ClientOptions = {}) {
    this.apiKey = opts.apiKey ?? resolveApiKey();
    this.baseUrl = opts.baseUrl ?? resolveBaseUrl();
  }

  /** Strip the query string before putting a URL in an error message —
   *  pagination cursors can carry params we don't want echoed into logs. */
  private static label(s: string): string {
    const q = s.indexOf("?");
    return q === -1 ? s : s.slice(0, q);
  }

  /**
   * The single response-validation chokepoint. HTTP errors, non-JSON bodies,
   * and Firecrawl's HTTP-200 `{success:false}` envelope ALL surface inline
   * here — so every path (request() and getAbsolute() pagination alike) is
   * honest and nothing is ever silently swallowed.
   */
  private async handle<T>(res: Response, method: string, label: string): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        const p = JSON.parse(text) as { error?: string; message?: string };
        detail = p.error ?? p.message ?? text;
      } catch {
        /* non-JSON error body — keep raw text */
      }
      const hint = res.status === 402 ? " (out of credits?)" : res.status === 401 ? " (bad API key?)" : "";
      throw new FirecrawlApiError(res.status, text, `Firecrawl API ${res.status} on ${method} ${label}${hint}: ${detail}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new FirecrawlApiError(res.status, text, `Firecrawl returned non-JSON on ${method} ${label}: ${text.slice(0, 300)}`);
    }

    if (parsed && typeof parsed === "object" && (parsed as { success?: boolean }).success === false) {
      const p = parsed as { error?: string; message?: string; code?: string };
      const detail = p.error ?? p.message ?? "request failed";
      const code = p.code ? ` [${p.code}]` : "";
      throw new FirecrawlApiError(res.status, text, `Firecrawl ${method} ${label} failed${code}: ${detail}`);
    }

    return parsed as T;
  }

  /** The network chokepoint for relative endpoints. Auth via header only. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new FirecrawlApiError(0, "", `Network error reaching ${path}: ${detail}`);
    }
    return this.handle<T>(res, method, path);
  }

  // ---- single-shot endpoints -------------------------------------------------

  scrape(payload: Record<string, unknown>): Promise<ScrapeResponse> {
    return this.request<ScrapeResponse>("POST", "/scrape", payload);
  }

  map(payload: Record<string, unknown>): Promise<MapResponse> {
    return this.request<MapResponse>("POST", "/map", payload);
  }

  search(payload: Record<string, unknown>): Promise<SearchResponse> {
    return this.request<SearchResponse>("POST", "/search", payload);
  }

  creditUsage(): Promise<CreditUsageResponse> {
    return this.request<CreditUsageResponse>("GET", "/team/credit-usage");
  }

  // ---- async jobs: crawl -----------------------------------------------------

  startCrawl(payload: Record<string, unknown>): Promise<JobStartResponse> {
    return this.request<JobStartResponse>("POST", "/crawl", payload);
  }

  getCrawl(id: string): Promise<JobStatusResponse> {
    return this.request<JobStatusResponse>("GET", `/crawl/${id}`);
  }

  cancelCrawl(id: string): Promise<{ success: boolean; status?: string }> {
    return this.request("DELETE", `/crawl/${id}`);
  }

  // ---- async jobs: batch scrape ---------------------------------------------

  startBatch(payload: Record<string, unknown>): Promise<JobStartResponse> {
    return this.request<JobStartResponse>("POST", "/batch/scrape", payload);
  }

  getBatch(id: string): Promise<JobStatusResponse> {
    return this.request<JobStatusResponse>("GET", `/batch/scrape/${id}`);
  }

  cancelBatch(id: string): Promise<{ success: boolean; status?: string }> {
    return this.request("DELETE", `/batch/scrape/${id}`);
  }

  /**
   * Fetch an absolute pagination URL (the `next` cursor). Routes through the
   * same `handle()` chokepoint, so a `{success:false}` mid-pagination throws
   * instead of being silently treated as "no more pages".
   */
  async getAbsolute<T>(absoluteUrl: string): Promise<T> {
    const label = FirecrawlClient.label(absoluteUrl);
    let res: Response;
    try {
      res = await fetch(absoluteUrl, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new FirecrawlApiError(0, "", `Network error reaching ${label}: ${detail}`);
    }
    return this.handle<T>(res, "GET", label);
  }
}

/** Sleep helper for poll loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
