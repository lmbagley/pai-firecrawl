# Contributing to pai-firecrawl

Thanks for your interest. This is a small, dependency-free Bun CLI wrapping the
Firecrawl v2 API. Contributions that keep it small, honest, and well-tested are
welcome.

## Development setup

```bash
git clone https://github.com/lmbagley/pai-firecrawl.git
cd pai-firecrawl
bun install          # dev types only — there are no runtime dependencies
```

You only need a free Firecrawl key (see the README "Configure" section) if you want
to run live commands. The test suite needs no key and makes zero network calls.

## Before you open a PR

```bash
bun test             # unit suite — fixture-based, no live API calls
bun run typecheck    # tsc --noEmit, must be clean
```

Both must be green. New behavior needs a test; fixtures live in `test/fixtures.ts`
and are captured from real v2 responses.

## Design principles (please preserve these)

- **Zero runtime dependencies.** The whole point is a tiny, auditable surface. A PR
  that adds a runtime dependency needs a strong justification.
- **One network chokepoint.** Every Firecrawl call routes through `FirecrawlClient`
  → `handle()`, which surfaces HTTP errors *and* Firecrawl's `{success:false}`
  200-envelopes inline. Don't add a second fetch path that bypasses it — that
  reintroduces silent truncation (see the [CHANGELOG](./CHANGELOG.md)).
- **Errors surface inline.** Never swallow an error into a log file or print "check
  the logs." Print the real API/network error where the command was run.
- **No secrets in source.** Keys come from the environment or a chmod-600 key file,
  never from a tracked file.

## Reporting bugs

Open an issue with the command you ran, the output you got, and what you expected.
Redact your API key.
