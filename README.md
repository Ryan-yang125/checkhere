# CheckHere

[![CI](https://github.com/Ryan-yang125/checkhere/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryan-yang125/checkhere/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Ryan-yang125/checkhere)](https://github.com/Ryan-yang125/checkhere/releases/latest)
[![License](https://img.shields.io/github/license/Ryan-yang125/checkhere)](LICENSE)

**The final local browser check for AI-built websites.**

CheckHere is a free, open-source, local-first CLI. It opens a local or deployed website with Playwright Chromium, captures desktop and mobile evidence, checks common launch failures, runs SEO and Lighthouse audits, and writes HTML, Markdown, and JSON reports to your machine.

```bash
curl -fsSL https://checkhere.page/install.sh | bash
checkhere setup
checkhere http://localhost:3000 --open
```

All scans and report artifacts stay on the machine running the command. CheckHere has no account, hosted scan queue, or report upload step.

## What it checks

- Desktop and mobile screenshots
- HTTP status, blank pages, page errors, and console errors
- Failed requests, broken images, and broken static assets
- Mobile horizontal overflow
- Explicit routes and sampled same-origin routes
- Titles, descriptions, headings, canonical URLs, robots, sitemap, JSON-LD, social images, and image alt text
- Lighthouse Performance, Accessibility, Best Practices, SEO, LCP, CLS, and TBT

## CLI

```bash
# First-time browser setup
checkhere setup

# Local development or a deployed URL
checkhere http://localhost:3000
checkhere https://example.com --open

# Release gate
checkhere ci https://example.com --fail-on=critical
checkhere ci https://example.com --routes routes.txt --fail-on=page-score:80
checkhere ci https://example.com --routes routes.txt --routes-only --max-routes=8 --fail-on=page-score:85

# Diagnostics
checkhere doctor --json
```

Each completed check prints stable paths that an agent can consume:

```text
html_report_path=/absolute/path/report.html
agent_markdown_path=/absolute/path/report.md
json_report_path=/absolute/path/report.json
open_report_command=open "/absolute/path/report.html"
```

Reports are written under `./checkhere-reports/` by default. `report.json` is the canonical data source; HTML and agent Markdown are rendered from the same report object.

## Agent Skill

Install the portable CheckHere Agent Skill with a recent GitHub CLI:

```bash
gh skill install Ryan-yang125/checkhere checkhere --agent codex --scope user
gh skill install Ryan-yang125/checkhere checkhere --agent claude-code --scope user
```

The Skill guides an agent through the full release loop: run CheckHere locally, open the HTML evidence for the user, read the Markdown/JSON findings, fix authorized issues, redeploy, and run the check again.

See [`skills/checkhere/SKILL.md`](skills/checkhere/SKILL.md).

## GitHub Action

```yaml
name: CheckHere

on:
  deployment_status:

jobs:
  release-check:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: Ryan-yang125/checkhere@v0.4.0
        with:
          url: ${{ github.event.deployment_status.target_url }}
          fail-on: critical
```

The Action runs Chromium on the GitHub runner and uploads the local report bundle as a workflow artifact.

For an exact route-list gate, set `routes`, `routes-only: "true"`, and `max-routes`. In this mode the URL resolves relative entries from the route file and is not added as another scanned page.

## Local development

```bash
npm install
npm run check
npm test
npm run build
npm run cli -- https://checkhere.page
```

Scanner and reporter changes should start with a deterministic fixture and a test. Every issue keeps a stable `code`, `severity`, `message`, `evidence`, and `recommendation`.

## Open-source structure

```text
packages/cli       local CLI and CI contract
packages/scanner   Playwright and Lighthouse checks
packages/reporter  HTML, Markdown, and JSON reports
packages/shared    report types and URL validation
fixtures           deterministic scanner fixtures
skills/checkhere   portable Agent Skill
apps/api           static documentation site on checkhere.page
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) to add a check, fixture, documentation improvement, or false-positive fix. Security reports follow [SECURITY.md](SECURITY.md).

## 中文

CheckHere 是一个免费、开源、本地优先的网站上线验收 CLI。Chromium、Lighthouse、截图和报告生成都在运行命令的电脑上完成，支持 `localhost` 和公开部署地址。

推荐工作流：

```text
Agent 完成网站 → CheckHere 本地检查 → Agent 读取报告 → 修复 → 复检 → 交付
```

官网：[checkhere.page](https://checkhere.page) · 文档：[CLI](https://checkhere.page/docs/cli) · [Skill](https://checkhere.page/docs/skill) · [GitHub Action](https://checkhere.page/docs/github-actions)

## License

[Apache-2.0](LICENSE)
