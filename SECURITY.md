# Security Policy

## Reporting a vulnerability

If you find a security issue, please open a
[GitHub security advisory](https://github.com/lmbagley/pai-firecrawl/security/advisories/new)
(preferred), or a regular issue for non-sensitive reports. **Do not include your
Firecrawl API key or any other secret in a public issue.**

## How this tool handles your key

`pai-firecrawl` reads your Firecrawl API key from, in order:

1. the `FIRECRAWL_API_KEY` environment variable, or
2. a key file at `~/.config/firecrawl/api-key` (you should `chmod 600` it).

The key is sent **only** to the Firecrawl API, and **only** in an
`Authorization: Bearer` header — never in a URL, query string, log line, or any
file this tool writes. Error messages redact request query strings before printing,
so a signed URL never leaks into your terminal scrollback.

No key is ever committed to source, and the repository history has been scrubbed to
confirm no key was ever tracked.

## Self-hosting

Pointing `FIRECRAWL_API_URL` at your own instance keeps all traffic on
infrastructure you control. Note the self-hosted build lacks Firecrawl Cloud's
"Fire-engine" anti-bot layer.
