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
    tools?: SearchTool[];
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

// ---- Alexandria (catalogued data providers via /v2/search + /v2/scrape) ----
// Shapes captured from live probes 2026-09-29 and the official SDK
// (@mendable/firecrawl-js 4.42.0 scrapeAlexandria/findTools).

/** One capability invocation: the body element of `alexandria: [...]`. */
export interface AlexandriaCall {
  provider: string;
  capability: string;
  version?: string;
  options?: Record<string, unknown>;
}

export interface AlexandriaItemError {
  code?: string;
  message?: string;
  status?: number;
  requiresAction?: { url?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** One per-capability result inside `data.alexandria`. */
export interface AlexandriaResult {
  provider: string;
  capability: string;
  creditsCost?: number;
  data?: unknown;
  records?: unknown;
  error?: AlexandriaItemError;
  alexandriaId?: string;
  [key: string]: unknown;
}

export interface AlexandriaResponse {
  success: boolean;
  scrape_id?: string;
  data: {
    alexandria: AlexandriaResult[];
    creditsCost: number;
  };
}

export interface ContractOption {
  name: string;
  type?: string;
  about?: string;
  required?: boolean;
  min?: number;
  max?: number;
  [key: string]: unknown;
}

/** One catalogue entry returned by find-tools (level: categories|providers|groups|tools). */
export interface CatalogueItem {
  id?: string;
  provider?: string;
  capability?: string;
  name?: string;
  description?: string;
  creditsCost?: number;
  perRecord?: boolean;
  requiresOneOf?: string[][];
  options?: ContractOption[];
  response?: { about?: string; key?: string; fields?: ContractOption[]; [key: string]: unknown };
  execute?: AlexandriaCall;
  next?: AlexandriaCall | null;
  [key: string]: unknown;
}

export interface FindToolsData {
  level?: string;
  items: CatalogueItem[];
  total?: number;
  next?: AlexandriaCall | null;
  suggestion?: string;
  [key: string]: unknown;
}

/** A ranked tool inside /v2/search `data.tools` when sources includes alexandria. */
export interface SearchTool {
  provider: string;
  capability: string;
  description?: string;
  [key: string]: unknown;
}
