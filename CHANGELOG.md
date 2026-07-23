# Changelog

## v0.4.0 - 2026-07-23

### Added

- Local-first `checkhere <url>` workflow for localhost and deployed sites.
- `checkhere setup` for the matching Playwright Chromium build.
- Local `doctor` checks for Node, packages, and browser readiness.
- Exact route-list gates with `--routes-only` and an explicit-route `--max-routes` cap.
- Portable CheckHere Agent Skill.
- GitHub Action that runs CheckHere on a GitHub-hosted runner and uploads report artifacts.
- Public CLI, Skill, Action, install, check-reference, and launch-checklist documentation.

### Changed

- Browser execution and report generation now happen entirely on the caller's machine.
- CLI output now returns absolute local HTML, Markdown, and JSON report paths.
- The public website is a documentation and discovery surface for the open-source CLI.
- The install script now installs the versioned CLI tarball from GitHub Releases.

### Removed

- Hosted scan submission from the product workflow.
- VPS browser runner dependency.
- Remote report upload and retention from the CLI contract.
