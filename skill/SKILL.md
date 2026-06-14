---
name: Firecrawl
description: "Scrape, crawl, map, search, and extract the live web to clean markdown via the Firecrawl v2 API — free tier (1,000 pages/mo, no card). A thin conversational router over the standalone CLI at ~/working/pai-firecrawl/cli.ts; the CLI holds ALL logic. Markdown by default, credits reported per call, errors surfaced inline. USE WHEN firecrawl, scrape a URL with firecrawl, crawl a whole site for free, map a site's URLs, web search and scrape the results, structured/LLM extraction from a page, free-tier scrape, turn a URL into markdown, get every page from a site, check Firecrawl credits. COEXISTS with the BrightData and Interceptor skills — it does NOT replace them. NOT FOR real-browser bot-bypass needing a logged-in session or zero CDP fingerprint (use Interceptor); NOT FOR CAPTCHA-hard / residential-proxy sites (use BrightData Tier 4); NOT FOR the Porsche monitor (stays on Interceptor) or the Reverb monitor (untouched)."
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

Add `--json` to any read command for the raw API envelope. Run `… help` for the full flag list.

## Gotchas

- **Free tier = 1,000 pages/month**, monthly-renewing, no credit card. Every call prints `credits used: N`; check the running balance with `usage` before large crawls.
- **crawl / batch are async.** Without `--poll` you get a job id (resume with `status <id> --type crawl|batch`); with `--poll` the CLI waits and aggregates all pages, following pagination.
- **No tier escalation to manage.** Firecrawl does JS rendering + anti-bot inside one `/scrape` call — unlike BrightData there are no WebFetch→curl→proxy tiers to step through.
- **Errors are already surfaced inline** by the CLI: the real API/network message + a non-zero exit. Firecrawl's HTTP-200 `{success:false}` envelopes (DNS failures, blocked pages) are caught at the client chokepoint too — so a "failed" result shows *why*, never a silent empty body.
- **Structured extraction uses the scrape json path** (`--prompt`/`--schema`), not the deprecated `/extract` job endpoint.
- **Config:** key from `FIRECRAWL_API_KEY` env or `~/.config/firecrawl/api-key`. Self-host by setting `FIRECRAWL_API_URL` (note: self-hosted loses the cloud anti-bot layer).
- **Coexistence:** reach for **BrightData** on CAPTCHA/residential-proxy-hard sites, **Interceptor** when you need a logged-in session or zero-fingerprint real Chrome. Don't migrate the Porsche or Reverb monitors here.

## Execution Log

After running a workflow, append a single JSONL entry:

```bash
echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","skill":"Firecrawl","workflow":"SUBCOMMAND_USED","input":"8_WORD_SUMMARY","status":"ok|error","duration_s":SECONDS}' >> ~/.claude/PAI/MEMORY/SKILLS/execution.jsonl
```
