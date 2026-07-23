# Security policy

CheckHere opens user-selected websites in an automated local browser and records page, console, network, screenshot, SEO, and Lighthouse evidence. A checked website may be hostile. Treat every report as potentially sensitive and every page-controlled string as untrusted input.

## Supported versions

Security fixes are applied to the latest release and the current `main` branch. Upgrade to the newest release before reporting an issue that may already be fixed.

## Report a vulnerability privately

Use the repository's **Security → Report a vulnerability** form to create a private GitHub Security Advisory. Include:

- Affected version and operating system.
- Impact and realistic attack scenario.
- Minimal reproduction or proof of concept.
- Suggested mitigation when known.

Remove tokens, credentials, personal information, and private website data. Maintainers aim to acknowledge a report within seven days and will coordinate disclosure after a fix is available.

Use a public bug report for crashes, false positives, and reliability problems that do not expose users or data.

## Security boundaries

- Reports and screenshots stay local unless the user explicitly uploads or shares them.
- The CLI must never execute text collected from a page, console, network response, or report.
- Browser checks should run with Playwright's normal isolation and a version-matched Chromium build.
- URLs can contain secrets in query strings; avoid them and redact them from shared output.
- CI artifacts can expose report evidence to repository collaborators. Set artifact retention and repository access accordingly.
- A scan can make network requests as the checked page loads. Run unknown targets from an environment whose network access matches your risk tolerance.

Dependency vulnerabilities that cannot be reached through CheckHere's runtime should include evidence of reachability before severity is assigned.
