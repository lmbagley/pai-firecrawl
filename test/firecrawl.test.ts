import { test, expect, describe, afterEach } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseArgs, pollAndCollect } from "../cli.ts";
import {
  resolveApiKey,
  resolveBaseUrl,
  FirecrawlClient,
  FirecrawlConfigError,
  FirecrawlApiError,
} from "../src/firecrawl.ts";
import {
  formatScrape,
  formatMap,
  formatSearch,
  formatPages,
  formatUsage,
  creditFooter,
  jsonOut,
} from "../src/format.ts";
import {
  scrapeFixture,
  mapFixture,
  searchFixture,
  crawlStatusFixture,
  usageFixture,
  failureEnvelope,
} from "./fixtures.ts";
import type { SearchResponse } from "../src/types.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("parseArgs", () => {
  test("positionals + value flag", () => {
    const { positionals, flags } = parseArgs(["scrape", "https://x.com", "--format", "html"]);
    expect(positionals).toEqual(["scrape", "https://x.com"]);
    expect(flags.format).toBe("html");
  });
  test("--flag=value form", () => {
    expect(parseArgs(["--limit=10"]).flags.limit).toBe("10");
  });
  test("boolean flags do not consume the next token", () => {
    const { positionals, flags } = parseArgs(["search", "espresso", "--json"]);
    expect(flags.json).toBe(true);
    expect(positionals).toEqual(["search", "espresso"]);
  });
  test("trailing value flag with no value becomes boolean", () => {
    expect(parseArgs(["--poll"]).flags.poll).toBe(true);
  });
  test("multi-word query collected as positionals", () => {
    expect(parseArgs(["search", "best", "espresso"]).positionals).toEqual(["search", "best", "espresso"]);
  });
});

describe("config resolution", () => {
  test("key from env wins", () => {
    expect(resolveApiKey({ FIRECRAWL_API_KEY: "fc-env" }, ["/nope"])).toBe("fc-env");
  });
  test("key falls back to file", () => {
    const dir = mkdtempSync(join(tmpdir(), "fc-test-"));
    const file = join(dir, "api-key");
    writeFileSync(file, "fc-file\n");
    try {
      expect(resolveApiKey({}, [file])).toBe("fc-file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("throws an actionable error when no key anywhere", () => {
    expect(() => resolveApiKey({}, ["/nonexistent/path"])).toThrow(FirecrawlConfigError);
    try {
      resolveApiKey({}, ["/nonexistent/path"]);
    } catch (e) {
      expect((e as Error).message).toContain("FIRECRAWL_API_KEY");
      expect((e as Error).message).toContain("~/.config/firecrawl/api-key");
    }
  });
  test("base url default + override + trailing-slash strip", () => {
    expect(resolveBaseUrl({})).toBe("https://api.firecrawl.dev/v2");
    expect(resolveBaseUrl({ FIRECRAWL_API_URL: "http://localhost:3002/v2/" })).toBe("http://localhost:3002/v2");
  });
});

describe("formatters", () => {
  test("scrape markdown is default body + credit footer", () => {
    const out = formatScrape(scrapeFixture.data, "markdown");
    expect(out).toContain("Example Domain");
    expect(out).toContain("credits used: 1");
  });
  test("scrape links format joins links", () => {
    expect(formatScrape(scrapeFixture.data, "links")).toContain("https://iana.org/domains/example");
  });
  test("scrape missing format degrades gracefully (no throw)", () => {
    expect(formatScrape({ metadata: {} }, "html")).toContain("no html");
  });
  test("creditFooter only renders for numbers", () => {
    expect(creditFooter(3)).toContain("credits used: 3");
    expect(creditFooter(undefined)).toBe("");
  });
  test("map lists count + urls + titles", () => {
    const out = formatMap(mapFixture.links);
    expect(out).toContain("2 URLs");
    expect(out).toContain("https://docs.example.com/b");
    expect(out).toContain("B page");
  });
  test("search renders web section + credits", () => {
    const out = formatSearch(searchFixture);
    expect(out).toContain("Web");
    expect(out).toContain("Firecrawl");
    expect(out).toContain("credits used: 2");
  });
  test("pages concatenate with separators", () => {
    const out = formatPages(crawlStatusFixture.data ?? [], crawlStatusFixture.creditsUsed);
    expect(out).toContain("2 pages");
    expect(out).toContain("Page one");
    expect(out).toContain("Page two");
    expect(out).toContain("---");
  });
  test("usage renders remaining/plan + window", () => {
    const out = formatUsage(usageFixture);
    expect(out).toContain("978 / 1000");
    expect(out).toContain("2026-07-14");
  });
});

describe("error surfacing at the request chokepoint (mocked fetch — no live API)", () => {
  test("HTTP-200 {success:false} envelope throws with the API error + code", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(failureEnvelope), { status: 200 })) as unknown as typeof fetch;
    const client = new FirecrawlClient({ apiKey: "fc-x", baseUrl: "https://api.test/v2" });
    await expect(client.scrape({ url: "https://nope.invalid" })).rejects.toThrow(/SCRAPE_DNS_RESOLUTION_ERROR/);
  });
  test("HTTP 402 throws an out-of-credits hint", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Payment Required" }), { status: 402 })) as unknown as typeof fetch;
    const client = new FirecrawlClient({ apiKey: "fc-x", baseUrl: "https://api.test/v2" });
    await expect(client.scrape({ url: "https://x.com" })).rejects.toThrow(/out of credits/);
  });
  test("transport failure is surfaced verbatim, not swallowed", async () => {
    globalThis.fetch = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    const client = new FirecrawlClient({ apiKey: "fc-x", baseUrl: "https://api.test/v2" });
    await expect(client.map({ url: "https://x.com" })).rejects.toThrow(/Network error.*ENOTFOUND/);
  });
  test("FirecrawlApiError carries status + body", () => {
    const e = new FirecrawlApiError(429, "rate limited", "too many");
    expect(e.status).toBe(429);
    expect(e.body).toBe("rate limited");
  });
  test("a successful 200 returns the parsed body", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(scrapeFixture), { status: 200 })) as unknown as typeof fetch;
    const client = new FirecrawlClient({ apiKey: "fc-x", baseUrl: "https://api.test/v2" });
    const r = await client.scrape({ url: "https://example.com" });
    expect(r.success).toBe(true);
    expect(r.data.markdown).toContain("Example Domain");
  });
});

describe("pollAndCollect (async job aggregation — mocked client, no live API)", () => {
  const fakeClient = (over: Record<string, unknown>): FirecrawlClient => over as unknown as FirecrawlClient;

  test("aggregates pages across the next-cursor pagination", async () => {
    const client = fakeClient({
      getCrawl: async () => ({
        success: true,
        status: "completed",
        creditsUsed: 2,
        next: "https://api.test/v2/crawl/x?skip=1",
        data: [{ markdown: "# p1" }],
      }),
      getAbsolute: async () => ({ success: true, status: "completed", next: null, data: [{ markdown: "# p2" }] }),
    });
    const { pages, creditsUsed } = await pollAndCollect(client, "crawl", "x", 5000);
    expect(pages?.length).toBe(2);
    expect(creditsUsed).toBe(2);
  });

  test("a failed job throws (not a silent empty success)", async () => {
    const client = fakeClient({ getCrawl: async () => ({ success: true, status: "failed" }) });
    await expect(pollAndCollect(client, "crawl", "x", 5000)).rejects.toThrow(/failed/);
  });

  test("a {success:false} mid-pagination propagates — no silent truncation", async () => {
    const client = fakeClient({
      getCrawl: async () => ({
        success: true,
        status: "completed",
        next: "https://api.test/v2/crawl/x?skip=1",
        data: [{ markdown: "# p1" }],
      }),
      getAbsolute: async () => {
        throw new FirecrawlApiError(200, "", "Firecrawl GET /crawl/x failed [RATE_LIMIT]: slow down");
      },
    });
    await expect(pollAndCollect(client, "crawl", "x", 5000)).rejects.toThrow(/RATE_LIMIT/);
  });
});

describe("search --scrape rendering", () => {
  test("scraped per-result markdown is rendered in the output", () => {
    const withContent: SearchResponse = {
      success: true,
      data: { web: [{ url: "https://x.com", title: "X", markdown: "# Hello from X\n\nbody text" }] },
      creditsUsed: 1,
    };
    expect(formatSearch(withContent)).toContain("Hello from X");
  });
});

describe("json passthrough", () => {
  test("jsonOut pretty-prints", () => {
    expect(jsonOut({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
