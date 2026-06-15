# pai-firecrawl

[![CI](https://github.com/lmbagley/pai-firecrawl/actions/workflows/ci.yml/badge.svg)](https://github.com/lmbagley/pai-firecrawl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun&logoColor=black)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

A small, dependency-free [Bun](https://bun.sh) CLI for the [Firecrawl](https://firecrawl.dev) v2 API. Scrape, crawl, map, search, and extract the live web to clean Markdown — from your terminal or any agent.

- **Markdown by default**, `--json` for raw API output.
- **Every credit cost reported** so you can see what each call spends against the free tier.
- **Every failure surfaced inline** — the real API/network error, never a "check the logs."
- **Zero runtime dependencies.** One client module, one formatter, one CLI.
- **Cloud or self-hosted** — point `FIRECRAWL_API_URL` at your own instance; nothing else changes.

## Why

Firecrawl handles JS rendering and anti-bot *inside a single API call*, and ships a genuinely free tier (1,000 pages/month, no credit card). This CLI is a thin, honest wrapper over that: no tier-escalation ceremony, no vendor lock-in, no secrets in source.

## Install

```bash
git clone https://github.com/lmbagley/pai-firecrawl.git
cd pai-firecrawl
bun install            # dev types only; there are no runtime deps

# optional: a global `firecrawl` command
bun link
```

Then either `bun cli.ts <command>` from the repo, or `firecrawl <command>` if you linked it.

## Configure (bring your own free key)

Get a free key (1,000 pages/mo, no card) at <https://www.firecrawl.dev/app/api-keys>, then:

```bash
# option A — env var
export FIRECRAWL_API_KEY=fc-yourkey

# option B — a key file (chmod 600)
mkdir -p ~/.config/firecrawl
printf '%s' 'fc-yourkey' > ~/.config/firecrawl/api-key
chmod 600 ~/.config/firecrawl/api-key
```

Self-hosting? Set `FIRECRAWL_API_URL=http://localhost:3002/v2` (note: self-hosted Firecrawl lacks the cloud "Fire-engine" anti-bot layer).

## Usage

```bash
firecrawl scrape  https://example.com
firecrawl scrape  https://news.site --only-main --format markdown
firecrawl scrape  https://shop.com --format links
firecrawl scrape  https://shop.com --prompt "product name and price"      # structured JSON
firecrawl map     https://docs.example.com --search api --limit 50
firecrawl search  "best espresso machines 2026" --limit 5 --scrape
firecrawl crawl   https://docs.example.com --limit 25 --max-depth 3 --poll
firecrawl batch   https://a.com https://b.com https://c.com --poll
firecrawl extract https://a.com https://b.com --prompt "company name and pricing"
firecrawl usage
```

### Commands

| Command | What it does |
|---------|--------------|
| `scrape <url>` | One page → markdown / html / rawHtml / links / screenshot / summary / structured json |
| `map <url>` | Fast discovery of every URL on a site |
| `search <query>` | Web search; `--scrape` also fetches each result's content |
| `crawl <url>` | Crawl a whole site (async; `--poll` waits and aggregates pages) |
| `batch <url...>` | Scrape many URLs in one async job (`--poll` to wait) |
| `extract <url...>` | LLM structured extraction **per URL** via `--prompt` or `--schema`, using the scrape JSON path. Note: this is per-page extraction, not Firecrawl's multi-URL agentic `/extract` (that job endpoint is deprecated). |
| `status <id>` | Check an async job (`--type crawl\|batch`) |
| `cancel <id>` | Cancel an async job (`--type crawl\|batch`) |
| `usage` | Remaining free-tier credits and billing window |

Run `firecrawl help` for the full flag reference.

### Output

Markdown by default; add `--json` to any read command for the raw API envelope. Structured extraction (`--prompt`/`--schema`) prints the extracted JSON object (and `extract --json` wraps each result as `{url, data, creditsUsed}`, not the raw envelope). Async commands without `--poll` print a job id you can `status` later. Put flags after the URL/query (`scrape <url> --format html`), not before.

## Development

```bash
bun test            # unit suite — fixture-based, makes zero live API calls
bun run typecheck   # tsc --noEmit
```

The single network chokepoint is `FirecrawlClient.request()`; it surfaces both HTTP errors and Firecrawl's `{success:false}` 200-envelopes inline. Response shapes in `src/types.ts` were captured from live v2 responses.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Keep it small,
dependency-free, and tested.

## Security

Key handling and vulnerability reporting are documented in [SECURITY.md](./SECURITY.md).
Never put your API key in a public issue.

## License

MIT — see [LICENSE](./LICENSE).
