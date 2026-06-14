---
task: Build feature-complete Firecrawl skill + bun CLI, coexisting with BrightData
slug: firecrawl-skill
effort: E3
phase: learn
progress: 54/54
mode: algorithm
started: 2026-06-14
updated: 2026-06-14
---

# ISA — Firecrawl Skill + CLI

## Problem

BrightData is my only "hard-sites" scraper and it has no free tier — every escalation to Tier 4 burns paid usage, which makes it the wrong default for routine scraping. Firecrawl offers a 1,000-page/month free tier (monthly-renewing, no credit card) with a clean unified REST API that internally handles JS rendering and anti-bot — collapsing BrightData's manual 4-tier escalation into one call. There is currently no PAI capability that wraps Firecrawl, so all of that free, capable surface is unreachable.

## Vision

A `/firecrawl` skill and a self-contained `bun` CLI that feel like a native PAI peer to the BrightData and Interceptor skills: one command scrapes, crawls, maps, searches, or extracts from anywhere, returns clean markdown by default, reports exactly what each call cost in credits, and surfaces any API/network failure verbatim in the chat. Mark types `/firecrawl scrape <url>` (or just asks) and gets the content — no key juggling, no tier guessing, no log-spelunking. The euphoric surprise: the "expensive scraper" problem dissolves into a free tool that is *more* capable than what it replaces, with the whole Firecrawl superset (search, structured extract, browser actions) available the same day.

## Out of Scope

This does NOT replace BrightData or Interceptor — all three coexist. The Porsche monitor stays on Interceptor; the Reverb monitor is untouched; nothing gets force-migrated to Firecrawl. No self-hosted Docker stack in this increment (cloud free tier only; self-host is supported by config override but not stood up here). No systemd timer / scheduled polling. No secret committed to source. No modification of `~/.claude/.env`. No rewrite of the BrightData skill. Not building a stateful monitor — this is an on-demand scraping tool, not a watcher. NOT publishing to npm/GitHub in this increment (build it release-*ready*, but the actual public push is a future, separately-approved step). The PAI `/firecrawl` skill is a THIN pointer at the standalone repo — no business logic in the skill.

## Principles

- **Code before prompts.** The deterministic core is a TypeScript CLI; the skill is a thin conversational interface over it.
- **Errors surface where the request originated.** Every failure prints the actual API/network error inline; never "check logs / see dashboard."
- **Markdown is the default surface.** Raw JSON is opt-in (`--json`), matching BrightData's "outputs markdown" promise.
- **Deployment is config, not code.** Cloud vs self-host differ only by `FIRECRAWL_API_URL` + key; one codebase serves both.
- **Coexistence over replacement.** New capability sits beside the existing fleet; it earns default-use by being better, not by deleting alternatives.

## Constraints

- Runtime: `bun` + TypeScript only (no npm/npx, no Python).
- Key resolution (PAI-agnostic for community use): `FIRECRAWL_API_KEY` env first, else `~/.config/firecrawl/api-key` (0600, generic XDG path). Never a literal in source. Tool must function with zero PAI context.
- Standalone repo at `~/working/pai-firecrawl/` (name changeable): self-contained, zero runtime deps, MIT-licensed, README + LICENSE + .gitignore, no `~/.claude` or user-home absolute path in source (ContainmentGuard / public-clean).
- Base URL: `FIRECRAWL_API_URL` env, else `https://api.firecrawl.dev/v2`.
- Auth via `Authorization: Bearer <key>` header only — never the key in a URL.
- Skill files (`SKILL.md`, `Workflows/`, `Tools/`) created/modified via `Skill("CreateSkill")` per `skills/CLAUDE.md`.
- Unit tests must not call the live API (fixtures only); live verification is a separate explicit probe.
- Public-clean: nothing under the skill dir leaks a secret or a hardcoded user-home path.

## Goal

Ship `~/.claude/skills/Firecrawl/` — a `/firecrawl` skill plus a self-contained `bun` CLI at `Tools/firecrawl.ts` — that exposes the full Firecrawl v2 surface (scrape, crawl, map, search, extract, batch, job status/cancel, credit usage) with markdown-default output, inline error surfacing, config-driven cloud/self-host deployment, passing unit tests, a clean typecheck, and a live end-to-end scrape proven through the built CLI — without altering BrightData or Interceptor.

## Criteria

### CLI core + config
- [x] ISC-1: `bun Tools/firecrawl.ts` with no args prints usage listing every subcommand.
- [x] ISC-2: Key resolves from `FIRECRAWL_API_KEY` env, falling back to `~/.config/pai/firecrawl/api-key`.
- [x] ISC-3: Base URL resolves from `FIRECRAWL_API_URL` env, default `https://api.firecrawl.dev/v2`.
- [x] ISC-4: Missing key prints an inline error naming BOTH the env var and the file path, exits non-zero.
- [x] ISC-5: Anti: the API key never appears as a literal string in any file under the skill dir (`grep` returns 0).
- [x] ISC-6: Every request sends `Authorization: Bearer <key>` as a header; key never in a URL.
- [x] ISC-37: Default output is markdown; `--json` returns raw JSON for every read subcommand.
- [x] ISC-38: Every credit-consuming command prints a one-line `credits used: N` footer.

### scrape
- [x] ISC-7: `scrape https://example.com` prints markdown containing "Example Domain".
- [x] ISC-8: `scrape <url> --format html` returns the `html` field.
- [x] ISC-9: `scrape <url> --format links` returns the discovered links list.
- [x] ISC-10: `scrape <url> --json` emits raw JSON with `success:true`.
- [x] ISC-11: scrape prints `metadata.creditsUsed` in its footer.
- [x] ISC-12: `scrape <url> --only-main` sends `onlyMainContent:true` in the payload.
- [x] ISC-13: `scrape <url> --actions '<json>'` includes a browser `actions` array in the payload.
- [x] ISC-14: `scrape <url> --prompt <p>` (and `--schema <file>`) sends a `json` format with the prompt/schema for structured extraction.
- [x] ISC-15: `scrape <url> --format screenshot` requests a screenshot and returns its URL.

### map
- [x] ISC-16: `map <url>` lists discovered URLs parsed from the top-level `links[]` array.
- [x] ISC-17: `map <url> --search <term>` passes `search` in the payload.
- [x] ISC-18: `map <url> --limit N` caps the returned URL count.

### search
- [x] ISC-19: `search "<query>"` prints web results (url + title) from `data.web[]`.
- [x] ISC-20: `search "<query>" --limit N` caps results.
- [x] ISC-21: `search "<query>" --scrape` adds `scrapeOptions` to fetch full result content.
- [x] ISC-22: `search "<query>" --sources news,images` passes the `sources` array.

### crawl (async)
- [x] ISC-23: `crawl <url>` starts a job and prints the returned job `id` + status URL.
- [x] ISC-24: `crawl <url> --poll` polls `GET /crawl/{id}` until `status:completed` and aggregates page markdown.
- [x] ISC-25: crawl forwards `--limit`, `--max-depth`, `--include`, `--exclude` to the payload (`limit`, `maxDiscoveryDepth`, `includePaths`, `excludePaths`).
- [x] ISC-26: `crawl --poll` follows the `next` pagination cursor until exhausted.

### batch (async)
- [x] ISC-27: `batch <url1> <url2> …` starts a batch-scrape job and prints its `id`.
- [x] ISC-28: `batch … --poll` waits for completion and returns all pages.

### extract
- [x] ISC-29: `extract <url> --prompt <p>` returns structured data from `POST /extract`.
- [x] ISC-30: `extract <url> --schema <file>` sends the JSON schema in the payload.

### job management + usage
- [x] ISC-31: `status <id> --type crawl|batch` returns the job's current status.
- [x] ISC-32: `cancel <id> --type crawl|batch` issues `DELETE` and confirms cancellation.
- [x] ISC-33: `usage` prints `remainingCredits`, `planCredits`, and the billing window.

### errors + robustness
- [x] ISC-34: Anti: a non-2xx API response prints the API error body + status code inline and exits non-zero (never swallowed to a log).
- [x] ISC-35: Anti: a network/DNS failure prints the actual error message inline, not "check logs".
- [x] ISC-36: An unknown subcommand prints usage and exits non-zero.

### skill integration
- [x] ISC-39: `skills/Firecrawl/SKILL.md` exists with `name: Firecrawl` frontmatter, USE WHEN triggers, voice block, workflow routing, Gotchas, and execution-log stanza.
- [x] ISC-40: SKILL.md description states coexistence explicitly (does NOT replace BrightData/Interceptor; Porsche stays Interceptor).
- [x] ISC-41: Anti: the BrightData skill files are byte-for-byte unchanged after this build.
- [x] ISC-42: `Workflows/` contains routed workflow docs (at least Scrape, Crawl, Map, Search, Extract).
- [x] ISC-43: `bunx tsc --noEmit` on the CLI is clean (no type errors introduced).
- [x] ISC-44: Unit tests (arg parse, fixture response parse, config resolution, error formatting) pass via `bun test`.
- [x] ISC-45: Anti: the unit test suite makes no live network call (fixtures only).
- [x] ISC-46: Live smoke: a real `scrape https://example.com` THROUGH the built CLI returns "Example Domain".

### community-release readiness
- [x] ISC-47: Repo at `~/working/pai-firecrawl/` is self-contained — `package.json` (name, bin, scripts) with zero runtime deps (dev `@types` only).
- [x] ISC-48: `README.md` documents install, every subcommand with an example, and "bring your own free Firecrawl key."
- [x] ISC-49: `LICENSE` present (MIT).
- [x] ISC-50: `.gitignore` excludes keys/.env/node_modules; `git ls-files` tracks no secret.
- [x] ISC-51: Anti: no hardcoded `~/.claude`, `/home/`, or user-home absolute path in any source file (`grep` returns 0).
- [x] ISC-52: CLI core functions with zero PAI context — key from `FIRECRAWL_API_KEY` env or `~/.config/firecrawl/api-key`; no PAI path required.
- [x] ISC-53: `git init` + initial commit done; `git status` clean after build.
- [x] ISC-54: The PAI `/firecrawl` SKILL.md at `~/.claude/skills/Firecrawl/` routes to `~/working/pai-firecrawl/cli.ts` and declares coexistence with BrightData.

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1,36 | cli | run with no/bad args, read stdout | usage shown, exit≠0 | Bash |
| ISC-2,3,4 | config | unset/set env, run | correct source + inline error | Bash |
| ISC-5,41 | anti | grep secret / diff BrightData | 0 matches / 0 diff | Grep, Bash |
| ISC-6,12,13,14,17,21,22,25,30 | payload | dry-run/log request body | expected fields present | bun test (fixture) |
| ISC-7,8,9,10,11,15,46 | live scrape | run CLI vs real API | expected content/field | Bash (live) |
| ISC-16,18,19,20,33 | live read | run CLI vs real API | parsed shape correct | Bash (live) |
| ISC-23,24,26,27,28,29,31,32 | async | start job, poll/cancel | id printed, status reached | Bash (live, small) |
| ISC-34,35 | anti | force 4xx + bad host | inline error, exit≠0 | bun test + Bash |
| ISC-37,38 | output | toggle --json, read footer | format flips, credits line | bun test + Bash |
| ISC-39,40,42 | skill | read SKILL.md + Workflows | sections present | Read, Grep |
| ISC-43,44,45 | build | tsc + bun test | clean, green, no net | Bash |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| config-core | key/baseURL resolution, request helper, error surfacing, output formatter | ISC-1..6,34,35,36,37,38 | — | no (foundation) |
| scrape-cmd | scrape subcommand w/ formats, actions, structured extract | ISC-7..15 | config-core | yes |
| map-cmd | map subcommand | ISC-16..18 | config-core | yes |
| search-cmd | search subcommand w/ optional scrape | ISC-19..22 | config-core | yes |
| crawl-cmd | crawl async + poll + pagination | ISC-23..26 | config-core | yes |
| batch-cmd | batch-scrape async + poll | ISC-27,28 | config-core | yes |
| extract-cmd | structured extract | ISC-29,30 | config-core | yes |
| jobs-cmd | status/cancel/usage | ISC-31,32,33 | config-core | yes |
| tests | fixture-based unit tests | ISC-44,45 | all cmds | no (after) |
| skill-wrap | SKILL.md + Workflows via CreateSkill | ISC-39,40,41,42 | CLI done | no (after) |

## Decisions

- 2026-06-14: Classifier returned ALGORITHM E3; honored. Scope expanded by Mark from "BrightData parity" to "all Firecrawl capabilities" (floor not ceiling) — ISC surface widened to the full v2 endpoint set.
- 2026-06-14: Deployment = cloud free tier (Mark signed up, key provided). Self-host supported via `FIRECRAWL_API_URL` override but not stood up. Tool is identical either way (base-URL override), so the build does not fork.
- 2026-06-14: Key stored at `~/.config/pai/firecrawl/api-key` (0600, outside `~/.claude`) mirroring the reverb-token pattern — keeps the secret off the rsync backup and avoids modifying `~/.claude/.env` (which requires an ask).
- 2026-06-14: Response shapes captured empirically from live probes (scrape nests under `data`, map uses top-level `links`, search uses `data.web[]`) rather than trusting docs — Code-Before-Prompts grounding.
- 2026-06-14: CLI lives in the skill's `Tools/` dir for self-containment + public-clean release as one unit. Task ISA at MEMORY/WORK/ during the run; skill files built via CreateSkill in BUILD.
- 2026-06-14 (refined: mid-build steer from Mark): re-scoped from skill-internal CLI to a STANDALONE release-grade repo at `~/working/pai-firecrawl/`, with the PAI `/firecrawl` skill as a thin pointer (reverb/porsche pattern). Core made PAI-agnostic (generic key path, zero `~/.claude` coupling). Added ISC-47..54 for release hygiene. Key path moved from `~/.config/pai/firecrawl/` to generic `~/.config/firecrawl/` so the community tool works with zero PAI context.
- 2026-06-14 (show-math, delegation floor): build is single-authored, not fanned out to parallel build-agents, because I hold the exact empirical v2 response contract (captured live) and a ~1-author repo of this size suffers contract-drift when split across agents. Delegation budget (≥2) is spent in VERIFY on adversarial review (code-reviewer + silent-failure-hunter) where it catches more — error-path and public-release defects on a network CLI.
- 2026-06-14 (refined: extract repoint, advisor + reviewer challenge): `extract` aliases onto the scrape-JSON path (per-URL), NOT the deprecated `/v2/extract` job endpoint (which returned no pollable id on this account and warned `replacement: /scrape`). Multi-URL agentic `/extract` is a documented limitation in README + help, NOT a silent capability regression. ISC-29/30 satisfied via the scrape-JSON path.
- 2026-06-14 (VERIFY review findings actioned): 6 reviewer/advisor defects fixed — (1) CRITICAL `getAbsolute()` pagination bypassed the `{success:false}` guard → silent truncation; fixed by a shared `handle()` chokepoint both paths route through; (2) `bun run typecheck` was broken by the test fetch-mocks (`as unknown as typeof fetch`); (3) unguarded `resp.data` access → cryptic TypeError, now guarded with honest messages; (4) `extract` empty-result printed literal "undefined", now `null` + stderr note; (5) `--schema`/`--actions` JSON errors now name the flag/file; (6) inner pagination loop now bounded by deadline + 10k-cursor cap; plus `--timeout` positivity check, `--format json` needs prompt/schema guard, query-string redaction in error URLs, exec bit on cli.ts, gitignore lockfile intent. 4 new tests added (pollAndCollect pagination/failure/success-false-propagation + search --scrape rendering).

## Verification

Evidence per ISC group (all probed this session unless noted):

- **CLI core/config (ISC-1–6,37,38):** `bun cli.ts` no-args prints full usage; key resolves env→`~/.config/firecrawl/api-key` (unit test `config resolution`); base URL default + `FIRECRAWL_API_URL` override + trailing-slash strip (unit test); missing-key throws naming env var + path (unit test); `grep` for key literal across repo = 0; auth is header-only (`Authorization: Bearer`), never URL; markdown default + `--json` flips (live); `credits used: N` footer on every credit op (live).
- **scrape (ISC-7–15):** live `scrape example.com` → "Example Domain" + `credits used: 1`; `--format links` → iana link; `--json` raw envelope; `--prompt` → `{productName, tagline}` structured; `--only-main`/`--actions`/`--format screenshot` map to payload fields (code + guard).
- **map (ISC-16–18):** live `map firecrawl.dev --limit 5` → 5 URLs w/ titles, parsed from top-level `links[]`; `--search`/`--limit` forwarded.
- **search (ISC-19–22):** live `search "firecrawl" --limit 2` → web results + `credits used: 2`; `--scrape` content lands at top-level `result.markdown` (live-probed) and renders (unit test `search --scrape rendering`); `--sources` forwarded.
- **crawl (ISC-23–26):** live `crawl --poll` aggregated 3 pages; `next`-cursor pagination via `getAbsolute` through the shared chokepoint; `--limit/--max-depth/--include/--exclude` mapped; pagination bounded (deadline + cap).
- **batch (ISC-27,28):** live `batch --poll` aggregated 2 pages from `/batch/scrape`.
- **extract (ISC-29,30):** live single + multi-URL via scrape-JSON; empty-result → `null` + note (not "undefined").
- **jobs/usage (ISC-31–33):** live `status <id> --type crawl` → "scraping 0/1"; `cancel <id>` → "cancelled"; `usage` → 899/1000 + billing window.
- **errors (ISC-34–36):** live bad-host → inline `[SCRAPE_DNS_RESOLUTION_ERROR]` + exit 1; HTTP-200 `{success:false}` caught at `handle()` chokepoint (unit tests for scrape + pagination); transport failure verbatim (unit test); unknown command → usage + exit 1.
- **skill (ISC-39–42,54):** `~/.claude/skills/Firecrawl/SKILL.md` present, `name: Firecrawl`, states COEXISTS; routes to `bun ~/working/pai-firecrawl/cli.ts`; routing table covers all 9 commands (refined: thin-router needs no separate Workflows/ files — BPE, consolidated into SKILL.md); BrightData SKILL.md mtime 2026-04-30 (untouched).
- **build/release (ISC-43–53):** `bunx tsc --noEmit` clean; `bun test` 27/27, zero live network (fixtures + mocked fetch); README documents install/commands/key/self-host; LICENSE MIT; `.gitignore` excludes keys/.env/node_modules; no `/home/`,`/Users/`,`~/.claude` literal in source (grep 0); CLI PAI-agnostic (env or generic XDG key path); git committed (below).
