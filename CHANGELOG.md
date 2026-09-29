# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-29

### Added
- Firecrawl Alexandria support.
- `find-tools [query]`: browse the catalogue by category, provider, capability,
  website URL or free-text query, or read one contract (price, per-record
  pricing, required inputs, response fields). Free; reports `credits used: 0`.
- `search --sources alexandria` now renders the ranked `data.tools` block
  instead of printing "(no results)".
- `scrape --provider <p> --capability <c> --options <json>` runs a capability
  behind a spend guard. A free exact-match contract lookup happens first, and no
  paid request is sent on a missing tool, an unreadable price, missing required
  inputs, a paid call with no `--max-credits`, a worst case over the cap, or an
  unbounded per-record cost (`--assume-records` states a bound). Reports the
  billed `creditsCost` and warns on any overage.
- Spend-guard hardening from an adversarial review: only a limit option the
  contract declares bounds a per-record cost (whole number, clamped to the
  contract max); a missing `perRecord` flag refuses; `--max-credits` and
  `--assume-records` must be whole numbers; a non-2xx upstream status, missing
  data, or a result for a different capability is an error, never a success; a
  charge over plan or cap exits 3. `--version` is not offered because the
  catalogue prices only the latest version.
- 48 new tests (75 total), including request-counting refusal tests, checked by
  deliberately breaking the guard.

## [0.1.0] - 2026-06-15

First public release.

### Added
- Dependency-free Bun CLI for the Firecrawl v2 API.
- Commands: `scrape`, `map`, `search`, `crawl`, `batch`, `extract`, `status`,
  `cancel`, `usage`.
- `scrape` formats: markdown, html, rawHtml, links, screenshot, summary, and
  `--prompt`/`--schema` structured JSON; plus `--only-main` and `--actions`.
- `search --scrape` to fetch each result's content; `crawl`/`batch` async jobs with
  `--poll` aggregation and bounded `next`-cursor pagination.
- Markdown output by default, `--json` for the raw API envelope, and a
  `credits used: N` footer on every credit-spending call.
- Single network chokepoint (`handle()`) that surfaces HTTP errors and Firecrawl's
  `{success:false}` 200-envelopes inline — no silent failures.
- Cloud or self-hosted via `FIRECRAWL_API_URL`.
- API key resolved from `FIRECRAWL_API_KEY` or a chmod-600 key file; header-only
  auth, never placed in a URL.
- 27 fixture-based unit tests (zero live network) and a clean `tsc --noEmit`.

[0.2.0]: https://github.com/lmbagley/pai-firecrawl/releases/tag/v0.2.0
[0.1.0]: https://github.com/lmbagley/pai-firecrawl/releases/tag/v0.1.0
