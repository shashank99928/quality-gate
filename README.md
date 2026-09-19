# shsxnk Quality Gate

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Audit deployed pages from a GitHub workflow — SEO basics, accessibility markers, and security headers. No browser, no external services. Fails the check when critical findings appear.

## What it checks

Per page (server HTML only — no headless browser in v1):

| Rule | Severity |
| --- | --- |
| `<title>` present, 15–70 chars | warning on length, critical if missing |
| Meta description present, ≥ 50 chars | warning on short, critical if missing |
| Exactly one `<h1>` | critical |
| Canonical link present | warning |
| og:title present | warning |
| `<html lang>` present | critical |
| Images without `alt` in server HTML | warning with count |
| JSON-LD present | warning |
| Server HTML size > 250 KB | warning |
| Form fields without `<label>` | warning |
| Strict-Transport-Security header | critical |
| X-Content-Type-Options, Referrer-Policy | warning |
| Content-Security-Policy | critical, only with `require-csp: true` |

Page discovery: submit explicit paths via `pages`, or set `pages: auto` to read `<loc>` URLs from `sitemap.xml` (capped by `max-pages`).

## Usage

```yaml
name: Quality Gate
on:
    deployment_status:
on:
workflow_dispatch:
jobs:
    audit:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - name: Run quality gate
              uses: shashank99928/quality-gate@v1
              with:
                  base-url: https://www.shsxnk.com
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `base-url` | — (required) | Base URL of the deployed site |
| `pages` | `auto` | Comma-separated paths; `auto` reads `sitemap.xml` |
| `max-pages` | `25` | Page cap during auto-discovery |
| `fail-on-findings` | `true` | Fail the job when critical findings exist |
| `require-csp` | `false` | Also require a CSP header |
| `user-agent` | `shsxnk-quality-gate/1.0 …` | Request User-Agent |

## Outputs

| Output | Description |
| --- | --- |
| `pages-checked` | Number of pages audited |
| `problems` | Critical + warning findings |
| `critical` | Critical findings only |

## CLI

The action runtime is a dependency-free Node script, so you can also run it anywhere Node 20+ runs:

```sh
npx @shsxnk/quality-gate --base-url https://example.com --pages /,/about
```

## Why server HTML only

Server HTML is the largest audience for crawlers, link previews, and AI assistants. Rules that require a real browser (Lighthouse, axe) deserve their own tool; this action answers "would a crawler or a screener see a page worth ranking?" — fast, on every deploy.

## License

MIT
