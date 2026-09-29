import { test, expect, describe, afterEach } from "bun:test";

import { parseArgs, findToolsOptions, runAlexandriaScrape } from "../cli.ts";
import { FirecrawlClient } from "../src/firecrawl.ts";
import { formatFindTools, formatSearch, formatAlexandriaResult } from "../src/format.ts";
import { planSpend, recordBound, findExactContract, missingOneOfGroups, overageWarnings } from "../src/alexandria.ts";
import type { CatalogueItem, SearchResponse } from "../src/types.ts";

// Contracts captured from the live catalogue 2026-09-29 (trimmed).
const enrich: CatalogueItem = {
  id: "apollo/companies/enrich",
  provider: "apollo",
  capability: "companies/enrich",
  name: "Company enrichment",
  description: "Use when you have a domain or LinkedIn company URL and need the company behind it.",
  creditsCost: 30,
  perRecord: false,
  requiresOneOf: [["domain", "linkedin_url"]],
  options: [
    { name: "domain", type: "string", about: "Company domain." },
    { name: "linkedin_url", type: "string", about: "LinkedIn company page." },
  ],
  response: { about: "One company.", key: "organization", fields: [{ name: "name", type: "string" }] },
};
const lookup: CatalogueItem = {
  provider: "fullenrich",
  capability: "companies/lookup",
  creditsCost: 5,
  perRecord: true,
  requiresOneOf: [["domain", "professional_network_url", "professional_network_id"]],
  options: [{ name: "domain", type: "string" }],
};
const searchTool: CatalogueItem = {
  provider: "acme",
  capability: "jobs/search",
  creditsCost: 2,
  perRecord: true,
  options: [
    { name: "query", type: "string", required: true },
    { name: "limit", type: "number", min: 1, max: 50 },
  ],
};

const client = () => new FirecrawlClient({ apiKey: "fc-test", baseUrl: "https://api.test/v2" });

interface Sent {
  url: string;
  body: { alexandria?: Array<{ provider: string; capability: string; options?: Record<string, unknown> }> };
}

/** Route mocked fetch: find-tools calls get `catalogue`, anything else gets `exec`. Records every request. */
function mockAlexandria(catalogue: CatalogueItem[] | { error: object }, exec?: object): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url, body });
    const call = body.alexandria?.[0];
    if (call?.provider === "firecrawl" && call?.capability === "find-tools") {
      const item = Array.isArray(catalogue)
        ? { provider: "firecrawl", capability: "find-tools", creditsCost: 0, data: { level: "tools", items: catalogue, total: catalogue.length, next: null } }
        : { provider: "firecrawl", capability: "find-tools", ...catalogue };
      return new Response(JSON.stringify({ success: true, data: { alexandria: [item], creditsCost: 0 } }), { status: 200 });
    }
    return new Response(JSON.stringify(exec ?? { success: false, error: "unexpected execute" }), { status: 200 });
  }) as unknown as typeof fetch;
  return sent;
}

const paidCalls = (sent: Sent[]) =>
  sent.filter((s) => s.body.alexandria?.some((c) => !(c.provider === "firecrawl" && c.capability === "find-tools")));

const execOk = (charged: number) => ({
  success: true,
  scrape_id: "s1",
  data: {
    alexandria: [{ provider: "apollo", capability: "companies/enrich", creditsCost: charged, data: { organization: { name: "Firecrawl" } } }],
    creditsCost: charged,
  },
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("find-tools", () => {
  test("help lists find-tools and the Alexandria flow", () => {
    const r = Bun.spawnSync(["bun", "cli.ts", "help"], { cwd: `${import.meta.dir}/..` });
    const text = r.stdout.toString();
    expect(text).toContain("find-tools [query]");
    expect(text).toContain("--max-credits");
    expect(text).toContain("--sources <a,b>         search: web,news,images,alexandria");
  });

  test("flags + positional query map into find-tools options", () => {
    const { positionals, flags } = parseArgs([
      "find-tools", "company", "data", "--providers", "apollo,fullenrich", "--categories", "companies",
      "--capabilities", "companies/enrich", "--urls", "https://a.com", "--level", "tools",
      "--expand", "options,response", "--limit", "5", "--offset", "10",
    ]);
    expect(findToolsOptions(positionals.slice(1).join(" "), flags)).toEqual({
      query: "company data",
      providers: ["apollo", "fullenrich"],
      categories: ["companies"],
      capabilities: ["companies/enrich"],
      urls: ["https://a.com"],
      level: "tools",
      expand: ["options", "response"],
      limit: 5,
      offset: 10,
    });
  });

  test("client.findTools posts the firecrawl/find-tools alexandria call to /scrape", async () => {
    const sent = mockAlexandria([enrich]);
    const r = await client().findTools({ query: "x" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://api.test/v2/scrape");
    expect(sent[0]!.body).toEqual({ alexandria: [{ provider: "firecrawl", capability: "find-tools", options: { query: "x" } }] });
    expect(r.creditsCost).toBe(0);
    expect(r.data.items[0]!.capability).toBe("companies/enrich");
  });

  test("an item-level error throws with its code", async () => {
    mockAlexandria({ error: { code: "invalid_option", message: "Unknown or unavailable providers.", status: 400 } });
    await expect(client().findTools({ providers: ["nope"] })).rejects.toThrow(/find-tools failed \[invalid_option\]: Unknown or unavailable providers/);
  });

  test("renders price, per-record pricing, inputs, response, next offset, and cost", () => {
    const text = formatFindTools(
      { level: "tools", items: [enrich, lookup], total: 95, next: { provider: "firecrawl", capability: "find-tools", options: { offset: 2 } } },
      0,
    );
    expect(text).toContain("apollo/companies/enrich — Company enrichment  [30 credits]");
    expect(text).toContain("fullenrich/companies/lookup  [5 credits per record]");
    expect(text).toContain("needs one of: [domain | linkedin_url]");
    expect(text).toContain("- domain (string): Company domain.");
    expect(text).toContain("response key: organization");
    expect(text).toContain("2 of 95");
    expect(text).toContain("more: repeat with --offset 2");
    expect(text).toContain("credits used: 0");
  });

  test("an empty page says so and still reports cost", () => {
    const text = formatFindTools({ level: "tools", items: [], total: 0, next: null, suggestion: "Refine the query." }, 0);
    expect(text).toContain("(no matching tools — Refine the query.)");
    expect(text).toContain("credits used: 0");
  });
});

describe("search with sources: alexandria", () => {
  const resp: SearchResponse = {
    success: true,
    data: { tools: [{ provider: "apollo", capability: "companies/enrich", description: "Company behind a domain." }] },
    creditsUsed: 0,
  };
  test("renders data.tools as an Alexandria section instead of (no results)", () => {
    const text = formatSearch(resp);
    expect(text).toContain("## Alexandria tools");
    expect(text).toContain("1. apollo/companies/enrich");
    expect(text).not.toContain("(no results)");
  });
  test("points to find-tools for price before executing", () => {
    expect(formatSearch(resp)).toContain("firecrawl find-tools --providers <p> --capabilities <c>");
  });
});

describe("spend planning (pure)", () => {
  test("exact match only — a near match is not a contract", () => {
    expect(findExactContract([enrich], "apollo", "companies/enrich")).toBe(enrich);
    expect(findExactContract([enrich], "apollo", "companies/bulk-enrich")).toBeUndefined();
    expect(findExactContract([enrich], "apolo", "companies/enrich")).toBeUndefined();
  });
  test("requiresOneOf: empty strings and null do not count as present", () => {
    expect(missingOneOfGroups(enrich, { domain: "" })).toEqual([["domain", "linkedin_url"]]);
    expect(missingOneOfGroups(enrich, { linkedin_url: null })).toEqual([["domain", "linkedin_url"]]);
    expect(missingOneOfGroups(enrich, { domain: "a.com" })).toEqual([]);
  });
  test("a free call needs no cap; a paid call without --max-credits is refused", () => {
    expect(planSpend({ ...enrich, creditsCost: 0 }, { domain: "a.com" }, undefined).ok).toBe(true);
    const p = planSpend(enrich, { domain: "a.com" }, undefined);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("add --max-credits");
  });
  test("flat price over the cap is refused; at the cap passes", () => {
    expect(planSpend(enrich, { domain: "a.com" }, 29).ok).toBe(false);
    expect(planSpend(enrich, { domain: "a.com" }, 30)).toMatchObject({ ok: true, price: 30, worstCase: 30 });
  });
  test("missing or unreadable price fails closed", () => {
    expect(planSpend({ ...enrich, creditsCost: undefined }, { domain: "a.com" }, 100).ok).toBe(false);
    expect(planSpend({ ...enrich, creditsCost: Number.NaN }, { domain: "a.com" }, 100).ok).toBe(false);
    expect(planSpend({ ...enrich, creditsCost: -1 }, { domain: "a.com" }, 100).ok).toBe(false);
  });
  test("required option missing is refused", () => {
    const p = planSpend(searchTool, { limit: 5 }, 100);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain("requires option(s): query");
  });
  test("perRecord bound: caller limit, then the contract's max, then --assume-records, else unbounded", () => {
    expect(recordBound(searchTool, { query: "x", limit: 10 })).toEqual({ records: 10, why: "limit=10" });
    expect(recordBound(searchTool, { query: "x" })).toEqual({ records: 50, why: "contract max limit=50" });
    expect(recordBound(lookup, { domain: "a.com" })).toBeUndefined();
    expect(recordBound(lookup, { domain: "a.com" }, 1)).toEqual({ records: 1, why: "your --assume-records 1; the contract does not bound it" });
    // array inputs are never used as a bound
    expect(recordBound(lookup, { domain: "a.com", headcounts: ["1-10"] })).toBeUndefined();
  });
  test("perRecord worst case = price × bound, checked against the cap", () => {
    expect(planSpend(searchTool, { query: "x", limit: 10 }, 20)).toMatchObject({ ok: true, worstCase: 20 });
    expect(planSpend(searchTool, { query: "x", limit: 11 }, 20).ok).toBe(false);
    expect(planSpend(searchTool, { query: "x" }, 99).ok).toBe(false); // contract max 50 × 2 = 100
    const unbounded = planSpend(lookup, { domain: "a.com" }, 1000);
    expect(unbounded.ok).toBe(false);
    if (!unbounded.ok) expect(unbounded.reason).toContain("unbounded");
    expect(planSpend(lookup, { domain: "a.com" }, 5, 1)).toMatchObject({ ok: true, worstCase: 5 });
  });
  test("overage warnings fire above plan and above cap, not at or below", () => {
    expect(overageWarnings({ worstCase: 30, note: "30 credits per call" }, 30, 30)).toEqual([]);
    expect(overageWarnings({ worstCase: 30, note: "30 credits per call" }, 31, 40)).toHaveLength(1);
    expect(overageWarnings({ worstCase: 30, note: "30 credits per call" }, 45, 40)).toHaveLength(2);
  });
});

describe("guarded Alexandria scrape (mocked fetch — counts every request)", () => {
  const call = { provider: "apollo", capability: "companies/enrich", options: { domain: "firecrawl.dev" } };

  test("happy path: lookup first, then one execute, record + credits footer", async () => {
    const sent = mockAlexandria([enrich], execOk(30));
    const text = await runAlexandriaScrape(client(), call, 30, false);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.body.alexandria![0]!.capability).toBe("find-tools");
    expect(sent[0]!.body.alexandria![0]!.options).toMatchObject({ providers: ["apollo"], capabilities: ["companies/enrich"] });
    expect(sent[1]!.body).toEqual({ alexandria: [call] });
    expect(text).toContain("# apollo/companies/enrich");
    expect(text).toContain('"name": "Firecrawl"');
    expect(text).toContain("credits used: 30");
  });

  test("--json returns the raw envelope as parseable JSON", async () => {
    mockAlexandria([enrich], execOk(30));
    const text = await runAlexandriaScrape(client(), call, 30, true);
    expect(JSON.parse(text).data.creditsCost).toBe(30);
  });

  const refusals: Array<[string, CatalogueItem[] | { error: object }, number | undefined, RegExp, Record<string, unknown>?]> = [
    ["capability not in the catalogue", [], 100, /did not return apollo\/companies\/enrich/],
    ["only a near match returned", [{ ...enrich, capability: "companies/bulk-enrich" }], 100, /did not return/],
    ["lookup item error", { error: { code: "invalid_option", message: "Unknown or unavailable providers." } }, 100, /contract lookup .* failed, so nothing was executed/],
    ["no price in the contract", [{ ...enrich, creditsCost: undefined }], 100, /no readable price/],
    ["paid with no --max-credits", [enrich], undefined, /add --max-credits/],
    ["over --max-credits", [enrich], 10, /over --max-credits 10/],
    ["requiresOneOf unmet", [enrich], 100, /needs at least one of each group/, {}],
    ["perRecord unbounded", [{ ...enrich, perRecord: true }], 1000, /unbounded/],
  ];
  for (const [name, catalogue, cap, err, opts] of refusals) {
    test(`refuses with no paid request: ${name}`, async () => {
      const sent = mockAlexandria(catalogue, execOk(30));
      await expect(
        runAlexandriaScrape(client(), { ...call, options: opts ?? call.options }, cap, false),
      ).rejects.toThrow(err);
      expect(sent).toHaveLength(1); // the free lookup only
      expect(paidCalls(sent)).toHaveLength(0);
    });
  }

  test("lookup network failure refuses with no paid request", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    await expect(runAlexandriaScrape(client(), call, 100, false)).rejects.toThrow(/nothing was executed.*ENOTFOUND/);
    expect(n).toBe(1);
  });

  test("an execute item error surfaces its code and the credits charged", async () => {
    mockAlexandria([enrich], {
      success: true,
      data: { alexandria: [{ provider: "apollo", capability: "companies/enrich", creditsCost: 0, error: { code: "not_found", message: "No match" } }], creditsCost: 0 },
    });
    await expect(runAlexandriaScrape(client(), call, 30, false)).rejects.toThrow(/failed \[not_found\]: No match[\s\S]*credits used: 0/);
  });

  test("THIRD_PARTY_DATA_TERMS_REQUIRED surfaces the acceptance URL", async () => {
    mockAlexandria([enrich], {
      success: true,
      data: {
        alexandria: [{
          provider: "apollo", capability: "companies/enrich", creditsCost: 0,
          error: { code: "THIRD_PARTY_DATA_TERMS_REQUIRED", message: "Terms required", requiresAction: { url: "https://www.firecrawl.dev/app/terms/apollo" } },
        }],
        creditsCost: 0,
      },
    });
    await expect(runAlexandriaScrape(client(), call, 30, false)).rejects.toThrow(
      /THIRD_PARTY_DATA_TERMS_REQUIRED[\s\S]*accept the provider terms at: https:\/\/www\.firecrawl\.dev\/app\/terms\/apollo/,
    );
  });

  test("a malformed execute envelope is rejected, not rendered", async () => {
    mockAlexandria([enrich], { success: true, data: {} });
    await expect(runAlexandriaScrape(client(), call, 30, false)).rejects.toThrow(/unexpected envelope/);
  });

  test("formatAlexandriaResult renders data rows; records is the count (live FRED shape 2026-09-29)", () => {
    const text = formatAlexandriaResult(
      {
        provider: "fred",
        capability: "series/observations",
        creditsCost: 1,
        records: 8,
        upstreamStatus: 200,
        data: { count: 8, observations: [{ date: "2026-01-01", value: "4.3" }] },
      },
      1,
    );
    expect(text).toContain("records: 8 · upstream status: 200");
    expect(text).toContain('"value": "4.3"');
    expect(text).not.toMatch(/\n\n8\n/);
    expect(text).toContain("credits used: 1");
  });
});

describe("scrape argument rules (CLI process, no API key needed)", () => {
  const cli = (args: string[]) =>
    Bun.spawnSync(["bun", "cli.ts", ...args], {
      cwd: `${import.meta.dir}/..`,
      env: { ...process.env, FIRECRAWL_API_KEY: "fc-test", FIRECRAWL_API_URL: "http://127.0.0.1:9" },
    });
  test("a URL and --provider together are rejected", () => {
    const r = cli(["scrape", "https://a.com", "--provider", "apollo", "--capability", "companies/enrich"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("either a URL or --provider/--capability");
  });
  test("--provider without --capability is rejected", () => {
    const r = cli(["scrape", "--provider", "apollo"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("needs both --provider");
  });
  test("--options must be a JSON object", () => {
    const r = cli(["scrape", "--provider", "a", "--capability", "b", "--options", "[1]"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("--options must be a JSON object");
  });
});

// Regression tests for the 2026-09-29 silent-failure review (H1, H2, H3, M1, M4, L2).
describe("review regressions — spend guard cannot be talked past", () => {
  const perPage: CatalogueItem = {
    provider: "acme", capability: "rows", creditsCost: 1, perRecord: true,
    options: [{ name: "per_page", type: "number", max: 100 }],
  };
  test("H1: a limit the contract does not declare bounds nothing (server ignores it)", () => {
    // caller sets undeclared `limit`; contract only declares per_page (max 100) -> bound is the contract max
    expect(recordBound(perPage, { limit: 1 })).toEqual({ records: 100, why: "contract max per_page=100" });
    expect(planSpend(perPage, { limit: 1 }, 1).ok).toBe(false);
    expect(planSpend(perPage, { limit: 1 }, 100).ok).toBe(true);
  });
  test("H1: fractional or zero limits are rejected, not used as a bound", () => {
    expect(recordBound(perPage, { per_page: 0.01 })).toEqual({ error: "per_page must be a whole number of at least 1, got 0.01" });
    expect(planSpend(perPage, { per_page: 0.01 }, 1).ok).toBe(false);
    expect(planSpend(perPage, { per_page: 0 }, 1).ok).toBe(false);
    expect(planSpend(lookup, { domain: "a.com" }, 5, 0.1).ok).toBe(false);
  });
  test("H1: a caller limit above the contract max is clamped to the max", () => {
    expect(recordBound(perPage, { per_page: 500 })).toEqual({ records: 100, why: "per_page=100 (contract max)" });
  });
  test("H2: a missing or non-boolean perRecord refuses instead of pricing as one call", () => {
    for (const bad of [undefined, "true", 1]) {
      const p = planSpend({ ...enrich, perRecord: bad as unknown as boolean }, { domain: "a.com" }, 1000);
      expect(p.ok).toBe(false);
      if (!p.ok) expect(p.reason).toContain("per call or per record");
    }
  });
  test("M4: --max-credits must be a whole number", () => {
    expect(planSpend(enrich, { domain: "a.com" }, Infinity).ok).toBe(false);
    expect(planSpend(enrich, { domain: "a.com" }, 30.5).ok).toBe(false);
  });
  test("L2: an unreadable charge is flagged", () => {
    expect(overageWarnings({ worstCase: 30, note: "n" }, undefined, 30)[0]).toContain("did not report a readable charge");
  });
});

describe("review regressions — a failed result is never shown as success", () => {
  const call = { provider: "apollo", capability: "companies/enrich", options: { domain: "firecrawl.dev" } };
  const exec = (item: object) => ({ success: true, data: { alexandria: [{ provider: "apollo", capability: "companies/enrich", creditsCost: 30, ...item }], creditsCost: 30 } });
  afterEach(() => { process.exitCode = 0; });

  test("H3: upstream non-2xx throws with the charge", async () => {
    mockAlexandria([enrich], exec({ upstreamStatus: 502, data: { message: "bad gateway" } }));
    await expect(runAlexandriaScrape(client(), call, 30, false)).rejects.toThrow(/upstream returned HTTP 502[\s\S]*credits used: 30/);
  });
  test("H3: no data and no error throws", async () => {
    mockAlexandria([enrich], exec({ upstreamStatus: 200 }));
    await expect(runAlexandriaScrape(client(), call, 30, false)).rejects.toThrow(/returned no data and no error/);
  });
  test("H3: a result for a different capability throws", async () => {
    mockAlexandria([enrich], { success: true, data: { alexandria: [{ provider: "apollo", capability: "people/match", creditsCost: 30, data: {} }], creditsCost: 30 } });
    await expect(runAlexandriaScrape(client(), call, 30, false)).rejects.toThrow(/but the result is for apollo\/people\/match/);
  });
  test("L2: a charge over the cap still returns the data but sets exit code 3", async () => {
    mockAlexandria([enrich], exec({ creditsCost: 45, upstreamStatus: 200, data: { organization: {} } }));
    const text = await runAlexandriaScrape(client(), call, 30, false);
    expect(text).toContain("apollo/companies/enrich");
    expect(process.exitCode).toBe(3);
  });
});

describe("review regressions — CLI flags (process, no API)", () => {
  const cli = (args: string[]) =>
    Bun.spawnSync(["bun", "cli.ts", ...args], {
      cwd: `${import.meta.dir}/..`,
      env: { ...process.env, FIRECRAWL_API_KEY: "fc-test", FIRECRAWL_API_URL: "http://127.0.0.1:9" },
    });
  const base = ["scrape", "--provider", "a", "--capability", "b", "--options", "{}"];
  test("M1: --version is refused (cannot be priced)", () => {
    const r = cli([...base, "--version", "v2"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("--version is not supported");
  });
  test("M4: --max-credits Infinity / fraction are refused before any request", () => {
    for (const v of ["Infinity", "1.5", "1e999"]) {
      const r = cli([...base, "--max-credits", v]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr.toString()).toContain("--max-credits must be a whole number");
    }
  });
  test("--assume-records must be a whole number", () => {
    const r = cli([...base, "--assume-records", "0.1"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("--assume-records must be a whole number");
  });
});
