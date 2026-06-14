// Real Firecrawl v2 responses captured from live probes on 2026-06-14.
// Used so the unit suite can exercise parsing/formatting WITHOUT any network.

import type {
  ScrapeResponse,
  MapResponse,
  SearchResponse,
  JobStatusResponse,
  CreditUsageResponse,
} from "../src/types.ts";

export const scrapeFixture: ScrapeResponse = {
  success: true,
  data: {
    markdown:
      "# Example Domain\n\nThis domain is for use in documentation examples without needing permission.",
    links: ["https://iana.org/domains/example"],
    metadata: {
      title: "Example Domain",
      sourceURL: "https://example.com",
      statusCode: 200,
      creditsUsed: 1,
    },
  },
};

export const mapFixture: MapResponse = {
  success: true,
  links: [
    { url: "https://docs.example.com/a" },
    { url: "https://docs.example.com/b", title: "B page" },
  ],
};

export const searchFixture: SearchResponse = {
  success: true,
  data: {
    web: [
      { url: "https://firecrawl.dev/", title: "Firecrawl", description: "The web context API", position: 1 },
      { url: "https://github.com/firecrawl/firecrawl", title: "GitHub", description: "OSS", position: 2 },
    ],
  },
  creditsUsed: 2,
};

export const crawlStatusFixture: JobStatusResponse = {
  success: true,
  status: "completed",
  total: 2,
  completed: 2,
  creditsUsed: 2,
  next: null,
  data: [
    { markdown: "# Page one", metadata: { sourceURL: "https://site.com/1", statusCode: 200 } },
    { markdown: "# Page two", metadata: { sourceURL: "https://site.com/2", statusCode: 200 } },
  ],
};

export const usageFixture: CreditUsageResponse = {
  success: true,
  data: {
    remainingCredits: 978,
    planCredits: 1000,
    billingPeriodStart: "2026-06-14T15:37:54.287Z",
    billingPeriodEnd: "2026-07-14T15:37:54.287Z",
  },
};

// A real HTTP-200 failure envelope (scrape of a bad host).
export const failureEnvelope = {
  success: false,
  code: "SCRAPE_DNS_RESOLUTION_ERROR",
  error: 'DNS resolution failed for hostname "nope.invalid".',
};
