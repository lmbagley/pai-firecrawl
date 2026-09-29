---
name: Firecrawl
description: "Scrape, crawl, map, search, and extract the live web to clean markdown via the Firecrawl v2 API — free tier (1,000 pages/mo, no card). A thin conversational router over the standalone CLI at ~/working/pai-firecrawl/cli.ts; the CLI holds ALL logic. Also discovers and runs Firecrawl Alexandria catalogued data providers (company records, filings, economic series, jobs, places) behind a discover-first spend guard. Markdown by default, credits reported per call, errors surfaced inline. USE WHEN firecrawl, scrape a URL with firecrawl, crawl a whole site for free, map a site's URLs, web search and scrape the results, structured/LLM extraction from a page, free-tier scrape, turn a URL into markdown, get every page from a site, check Firecrawl credits, alexandria, data provider, company enrichment, firmographics, economic series, structured data from a provider, find-tools. COEXISTS with the BrightData and Interceptor skills — it does NOT replace them. NOT FOR real-browser bot-bypass needing a logged-in session or zero CDP fingerprint (use Interceptor); NOT FOR CAPTCHA-hard / residential-proxy sites (use BrightData Tier 4); NOT FOR the Porsche monitor (stays on Interceptor) or the Reverb monitor (untouched)."
effort: low
---

## Customization

**Before executing, check for user customizations at:**
`~/.claude/PAI/USER/SKILLCUSTOMIZATIONS/Firecrawl/`

If this directory exists, load and apply any PREFERENCES.md found there. Otherwise proceed with defaults.

## 🚨 MANDATORY: Voice Notification (REQUIRED BEFORE ANY ACTION)

```bash
curl -s -X POST http://localhost:31337/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running the Firecrawl skill to ACTION"}' > /dev/null 2>&1 &
```

Then output: `Running the **Firecrawl** skill to ACTION...`

## What this is

A thin router over `bun ~/working/pai-firecrawl/cli.ts`. The CLI is the system of record and holds every bit of scraping logic — this skill only picks the right subcommand, runs it, and renders the result. **Never reimplement scraping here.** The interface IS the conversation: read the request, run one CLI call, show the markdown.

## Command surface — route the request to ONE CLI call

| The ask | Command |
|---------|---------|
| Scrape one page | `bun ~/working/pai-firecrawl/cli.ts scrape <url> [--only-main] [--format markdown\|html\|links\|screenshot]` |
| Structured fields from a page | `… scrape <url> --prompt "<what to pull>"` (or `--schema <file.json>`) |
| Discover every URL on a site | `… map <url> [--search <term>] [--limit N]` |
| Web search (optionally with content) | `… search "<query>" [--limit N] [--scrape]` |
| Crawl a whole site | `… crawl <url> [--limit N] [--max-depth N] [--include a,b] [--exclude a,b] --poll` |
| Scrape many URLs at once | `… batch <url1> <url2> … --poll` |
| Extract structured data across pages | `… extract <url…> --prompt "<fields in words>"` |
| Check / cancel an async job | `… status <id> --type crawl\|batch` · `… cancel <id> --type crawl\|batch` |
| Free-tier credits remaining | `… usage` |
| Alexandria: find a data provider for a task (free) | `… search "<task>" --sources alexandria` |
| Alexandria: read a tool's price, inputs, response (free) | `… find-tools --providers <p> --capabilities <c>` (or `find-tools [query]`, `--categories <c>`) |
| Alexandria: run a tool (paid) | `… scrape --provider <p> --capability <c> --options '<json>' --max-credits <n>` |

Add `--json` to any read command for the raw API envelope. Run `… help` for the full flag list.

## Alexandria — discover, inspect, execute

Alexandria is a catalogue of data providers called through Firecrawl. Discovery is free; execution is billed at the tool's listed price. The order is fixed:

1. **Discover** with `search "<task>" --sources alexandria`. If that returns nothing, browse with `find-tools` (no args lists categories, then `--categories <id>`).
2. **Inspect** the chosen tool with `find-tools --providers <p> --capabilities <c>`: price, per-record or flat, required inputs, response fields.
3. **Execute** with `scrape --provider <p> --capability <c> --options '<json>' --max-credits <n>`, sizing `--max-credits` from the listed price.

Rules:

- **Only run capabilities discovery returned.** Never guess a provider or capability name. The CLI enforces this: it does a free exact-match contract lookup before every paid call and refuses (exit 1, nothing billed) when the tool is not in the catalogue, the price is unreadable, a required input is missing, the call is paid and `--max-credits` is absent, or the worst case is over the cap.
- **Per-record tools need a bound.** Set the tool's `limit` option, or pass `--assume-records <n>` when the contract gives no limit. The CLI refuses an unbounded per-record call.
- **Report every call's cost to the principal**, including `credits used: 0` for discovery. The footer comes from what Firecrawl actually billed; surface any overage warning verbatim.
- **Never accept provider terms.** A `THIRD_PARTY_DATA_TERMS_REQUIRED` error prints an acceptance URL for an org admin. Show it to the principal and stop; accepting is their decision.

## Gotchas

- **Free tier = 1,000 pages/month**, monthly-renewing, no credit card. Every call prints `credits used: N`; check the running balance with `usage` before large crawls.
- **crawl / batch are async.** Without `--poll` you get a job id (resume with `status <id> --type crawl|batch`); with `--poll` the CLI waits and aggregates all pages, following pagination.
- **No tier escalation to manage.** Firecrawl does JS rendering + anti-bot inside one `/scrape` call — unlike BrightData there are no WebFetch→curl→proxy tiers to step through.
- **Errors are already surfaced inline** by the CLI: the real API/network message + a non-zero exit. Firecrawl's HTTP-200 `{success:false}` envelopes (DNS failures, blocked pages) are caught at the client chokepoint too — so a "failed" result shows *why*, never a silent empty body.
- **Structured extraction uses the scrape json path** (`--prompt`/`--schema`), not the deprecated `/extract` job endpoint.
- **Config:** key from `FIRECRAWL_API_KEY` env or `~/.config/firecrawl/api-key`. Self-host by setting `FIRECRAWL_API_URL` (note: self-hosted loses the cloud anti-bot layer).
- **Alexandria `records` is a count, not the rows.** The rows are in `data`; the CLI prints `records: N` above them.
- **Semantic `find-tools "<query>"` can return 0 tools** when a category browse would find them. Fall back to `find-tools` → `--categories <id> --level tools` before concluding no provider exists.
- **Firecrawl MCP, if registered,** exposes the same flow: `firecrawl_search` (sources `["alexandria"]`) to discover, `firecrawl_find_tools` to inspect, `firecrawl_scrape` with an `alexandria` block to execute. A search listing carries no price, so on the MCP path always call `firecrawl_find_tools` for the exact provider and capability before executing. If a discover-first guard hook is installed, it denies an execution no earlier `firecrawl_find_tools` result priced, and paid calls prompt the principal with the worst-case cost. A pinned `version` cannot be priced and is refused on both paths.
- **Coexistence:** reach for **BrightData** on CAPTCHA/residential-proxy-hard sites, **Interceptor** when you need a logged-in session or zero-fingerprint real Chrome. Don't migrate the Porsche or Reverb monitors here.

## Execution Log

After running a workflow, append a single JSONL entry:

```bash
echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","skill":"Firecrawl","workflow":"SUBCOMMAND_USED","input":"8_WORD_SUMMARY","status":"ok|error","duration_s":SECONDS}' >> ~/.claude/PAI/MEMORY/SKILLS/execution.jsonl
```
