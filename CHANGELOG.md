# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/lmbagley/pai-firecrawl/releases/tag/v0.1.0
