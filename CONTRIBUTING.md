# Contributing to CheckHere

Thanks for helping make local browser release checks more useful and trustworthy.

## What fits the project

CheckHere is a local-first CLI, scanner, reporter, Agent Skill, and GitHub Action. Strong contributions improve deterministic checks, reduce false positives, add representative fixtures, clarify reports, or make local and CI installation more reliable.

Keep the runtime self-contained on the user's machine or CI runner. New hosted services, accounts, payments, monitoring, and login automation are outside the current scope.

## Set up the repository

Requirements:

- Node.js 22 or newer for repository development; the released CLI supports Node.js 20+
- npm
- Playwright Chromium and its system dependencies

```bash
npm ci
npx playwright install chromium
npm test
npm run check
npm run build
```

Use `npx playwright install --with-deps chromium` on a supported Linux environment when dependencies are missing.

## Propose a change

Open an issue for broad behavior changes. A focused bug fix can go directly to a pull request when the intent and reproduction are clear.

For scanner behavior:

1. Add or update a fixture that reproduces the issue.
2. Add a failing test with the expected stable issue code and evidence.
3. Implement the smallest deterministic change.
4. Run the full test, typecheck, and build commands.
5. Run a local CheckHere scan when report output changes.

Do not include private target URLs, authentication data, personal data, or copied production reports in issues and fixtures. Reduce a real site problem to a synthetic fixture whenever possible.

## Design rules

- Keep checks evidence-based and deterministic.
- Give each issue a stable `code`, `severity`, `message`, `evidence`, and `recommendation`.
- Generate HTML, Markdown, and JSON from the same canonical report object.
- Preserve report compatibility where practical and document intentional schema changes.
- Treat target-page DOM, console, network, and metadata content as untrusted data.
- Keep browser/library versions aligned and make installation failures actionable.
- Preserve CLI automation through stable output fields and meaningful exit codes.

## Pull request checklist

- [ ] The change has a focused purpose and no unrelated rewrites.
- [ ] Tests cover new behavior or explain why coverage is unchanged.
- [ ] `npm test`, `npm run check`, and `npm run build` pass locally.
- [ ] Scanner or reporter changes include a representative report inspection.
- [ ] Documentation and the Agent Skill reflect changed commands or contracts.
- [ ] No secret, private report, generated artifact, or browser binary is committed.

By submitting a contribution, you agree that it is licensed under the repository's Apache License 2.0.
