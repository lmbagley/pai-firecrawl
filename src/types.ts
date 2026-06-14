// Response shapes for the Firecrawl v2 API.
// Captured empirically from live probes (2026-06-14) — the API returns more
// fields than these; we type only what the CLI parses and leave the rest open.

export interface ScrapeMetadata {
  title?: string;
  description?: string;
  language?: string;
  sourceURL?: string;
  url?: string;
  statusCode?: number;
  contentType?: string;
  proxyUsed?: string;
  cacheState?: string;
  creditsUsed?: number;
  [key: string]: unknown;
}

export interface ScrapeData {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  summary?: string;
  links?: string[];
  screenshot?: string;
  json?: unknown;
  metadata?: ScrapeMetadata;
  [key: string]: unknown;
}

export interface ScrapeResponse {
  success: boolean;
  data: ScrapeData;
}

export interface MapLink {
  url: string;
  title?: string;
  description?: string;
}

export interface MapResponse {
  success: boolean;
  // Note: map returns links at the TOP LEVEL, not nested under `data`.
  links: MapLink[];
}

export interface SearchResult {
  url: string;
  title?: string;
  description?: string;
  position?: number;
  category?: string;
  // present when --scrape is used
  markdown?: string;
  metadata?: ScrapeMetadata;
  [key: string]: unknown;
}

export interface SearchResponse {
  success: boolean;
  data: {
    web?: SearchResult[];
    news?: SearchResult[];
    images?: SearchResult[];
    [key: string]: unknown;
  };
  creditsUsed?: number;
  id?: string;
}

export interface JobStartResponse {
  success: boolean;
  id: string;
  url?: string;
}

export interface JobStatusResponse {
  success: boolean;
  status: "scraping" | "completed" | "failed" | "cancelled" | string;
  total?: number;
  completed?: number;
  creditsUsed?: number;
  next?: string | null;
  data?: ScrapeData[];
  [key: string]: unknown;
}

export interface CreditUsageResponse {
  success: boolean;
  data: {
    remainingCredits?: number;
    planCredits?: number;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    [key: string]: unknown;
  };
}
