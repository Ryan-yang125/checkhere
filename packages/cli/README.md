# CheckHere CLI

CheckHere is a free, open-source browser release check that runs entirely on
your machine. It captures desktop and mobile screenshots, detects common launch
failures, runs technical SEO and Lighthouse audits, and writes HTML, Markdown,
and JSON reports locally.

```bash
npm install --global https://github.com/Ryan-yang125/checkhere/releases/download/v0.4.0/checkhere-0.4.0.tgz
checkhere setup
checkhere https://example.com --open
```

Use it as a release gate in CI:

```bash
checkhere setup --with-deps
checkhere ci https://example.com --fail-on=critical
checkhere ci https://example.com --routes routes.txt --routes-only --max-routes=8 --fail-on=page-score:85
```

`--max-routes` controls automatic same-origin sampling during a regular check. With
`--routes-only`, it caps the total filtered entries scanned from `--routes`; the
target URL only resolves relative route entries.

Documentation: <https://checkhere.page/docs/cli>

Source: <https://github.com/Ryan-yang125/checkhere>

License: Apache-2.0
