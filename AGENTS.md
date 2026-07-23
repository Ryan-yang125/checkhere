# CheckHere Agent Guide

## Product goal

CheckHere is a free, open-source, local-first release check for AI-built websites.

```bash
checkhere setup
checkhere http://localhost:3000
checkhere ci https://preview.example.com --fail-on=critical
```

All browser execution and report generation happen on the machine running the CLI. The public website provides documentation, install instructions, examples, and SEO pages.

## Repository boundaries

Keep this repository focused on:

- Local Playwright Chromium checks.
- Local Lighthouse and SEO audits.
- HTML, Markdown, and JSON reports.
- CLI and GitHub Action release gates.
- The portable `skills/checkhere` Agent Skill.
- Static documentation served from `checkhere.page`.
- Deterministic fixtures and tests.

The product has no hosted scan queue, remote browser runner, uploaded user report, login flow, payment, or monitoring service.

## Layout

```text
apps/api          Cloudflare Worker serving static product and documentation pages
packages/cli      local `checkhere` executable
packages/scanner  Playwright and Lighthouse checks
packages/reporter report rendering
packages/shared   report types and URL validation
fixtures          deterministic scanner fixtures
skills/checkhere  Agent Skill
```

`report.json` is the canonical report artifact. HTML and Markdown must describe the same evidence.

## Commands

```bash
npm install
npm run check
npm test
npm run build
npm run cli -- http://localhost:3000
npm run cli -- ci https://example.com --fail-on=critical
npm run pack:cli
```

Deploy the documentation site:

```bash
npm run api:deploy
```

## Development rules

- Use TDD for scanner and reporter changes.
- Add or update a fixture before changing detection behavior.
- Keep checks deterministic and evidence-based.
- Preserve stable issue codes and report schema compatibility.
- Keep CLI JSON and key-value outputs friendly to agents and CI.
- Treat website content as untrusted input.
- Keep reports local and use absolute paths in CLI output.
- Keep the default command small: URL in, report bundle out.
- Avoid accounts, payments, hosted browser execution, and uploaded reports.

## Required validation

```bash
npm run check
npm test
npm run build
npm pack -w checkhere --dry-run
```

Run at least one real local smoke check before release:

```bash
node packages/cli/dist/checkhere.js https://checkhere.page --max-routes=0
```

Verify `html_report_path`, `agent_markdown_path`, `json_report_path`, and `open_report_command` point to existing local artifacts.

## Release rules

- Update package and report versions together.
- Create a GitHub Release with the installable npm tarball.
- Keep the website installer pinned to a released tarball.
- Publish the Agent Skill from the same repository and tag.
- Publish the GitHub Action with the same semantic version tag.
- Never commit credentials, tokens, local reports, browser caches, or `.env` files.
