import { describe, expect, it } from "vitest";
import type { CheckReport } from "@checkhere/shared";
import { renderFixPrompt, renderHtml, renderMarkdown } from "./index.js";

const sampleReport: CheckReport = {
  schemaVersion: "3.0",
  appVersion: "0.4.0",
  id: "chk_sample",
  url: "https://example.com/",
  checkedAt: "2026-06-27T00:00:00.000Z",
  completedAt: "2026-06-27T00:00:02.000Z",
  status: "completed",
  result: "needs_fixes",
  score: 80,
  summary: "Found 1 issue to fix before sharing.",
  issues: [
    {
      code: "BROKEN_IMAGE",
      category: "assets",
      severity: "fix_soon",
      title: "Image failed to render",
      message: "/missing.png",
      evidence: { viewport: "mobile" },
      affectedPages: [{ label: "首页", url: "https://example.com/" }],
      recommendation: "Replace the missing image source or remove the broken image element."
    }
  ],
  pages: [
    {
      id: "home",
      label: "首页",
      source: "entry",
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      checkedAt: "2026-06-27T00:00:00.000Z",
      completedAt: "2026-06-27T00:00:02.000Z",
      status: "completed",
      result: "needs_fixes",
      score: 80,
      summary: "Found 1 issue to fix before sharing.",
      issues: [],
      viewports: []
    }
  ],
  site: {
    entryUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    pagesChecked: 1,
    pagesReady: 0,
    pagesNeedingFixes: 1,
    pagesBroken: 0,
    averageScore: 80,
    lowestScore: 80,
    requestedRoutes: [],
    sampledRoutes: [],
    failedPages: [{ label: "首页", url: "https://example.com/", result: "needs_fixes", score: 80 }]
  },
  viewports: [
    {
      name: "desktop",
      width: 1440,
      height: 900,
      finalUrl: "https://example.com/",
      status: 200,
      title: "Example",
      hasViewportMeta: true,
      faviconFound: true,
      bodyTextLength: 100,
      visibleElementCount: 10,
      documentWidth: 1440,
      horizontalOverflowPx: 0,
      screenshotPath: "screenshots/desktop-home.png",
      fullScreenshotPath: "screenshots/desktop-full.png",
      consoleEntries: [],
      pageErrors: [],
      failedRequests: [],
      errorResponses: [],
      brokenImages: [],
      timings: { navigationStart: 0, domContentLoadedMs: 100, loadEventMs: 200 }
    }
  ],
  routes: [],
  seo: {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    page: {
      title: "Example",
      metaDescription: "Example launch page for CheckHere reporter tests.",
      h1Texts: ["Example"],
      canonicalHref: "https://example.com/",
      robotsMeta: "",
      xRobotsTag: "",
      htmlLang: "en",
      openGraph: {
        title: "Example",
        description: "Example launch page.",
        image: "https://example.com/og.png"
      },
      twitter: {
        card: "summary_large_image",
        title: "Example",
        description: "Example launch page.",
        image: "https://example.com/og.png"
      },
      structuredData: {
        count: 1,
        validCount: 1,
        invalidCount: 0,
        types: ["WebSite"],
        errors: []
      },
      images: {
        total: 1,
        missingAltCount: 0,
        missingAltSamples: []
      }
    },
    robotsTxt: {
      url: "https://example.com/robots.txt",
      status: 200,
      exists: true,
      blocksHomepage: false,
      sitemaps: ["https://example.com/sitemap.xml"]
    },
    sitemap: {
      url: "https://example.com/sitemap.xml",
      status: 200,
      exists: true,
      valid: true,
      urlCount: 3,
      errors: []
    }
  },
  lighthouse: {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    fetchTime: "2026-06-27T00:00:02.000Z",
    lighthouseVersion: "13.4.0",
    categories: {
      performance: { title: "Performance", score: 0.82 },
      accessibility: { title: "Accessibility", score: 1 },
      "best-practices": { title: "Best Practices", score: 0.96 },
      seo: { title: "SEO", score: 0.91 }
    },
    metrics: {
      "first-contentful-paint": { title: "First Contentful Paint", score: 0.9, numericValue: 1200, displayValue: "1.2 s" },
      "largest-contentful-paint": { title: "Largest Contentful Paint", score: 0.75, numericValue: 2800, displayValue: "2.8 s" },
      "cumulative-layout-shift": { title: "Cumulative Layout Shift", score: 1, numericValue: 0, displayValue: "0" },
      "total-blocking-time": { title: "Total Blocking Time", score: 0.92, numericValue: 80, displayValue: "80 ms" },
      "speed-index": { title: "Speed Index", score: 0.8, numericValue: 2200, displayValue: "2.2 s" }
    },
    audits: [
      {
        id: "render-blocking-resources",
        title: "Eliminate render-blocking resources",
        score: 0,
        displayValue: "120 ms"
      }
    ],
    warnings: []
  },
  artifacts: {
    reportHtml: "report.html",
    reportMarkdown: "report.md",
    reportJson: "report.json",
    fixPrompt: "fix-prompt.md",
    screenshots: ["screenshots/desktop-home.png"],
    traces: []
  }
};

describe("reporter", () => {
  it("renders markdown with issue details", () => {
    const markdown = renderMarkdown(sampleReport);
    expect(markdown).toContain("# CheckHere 网站上线体检报告");
    expect(markdown).toContain("Agent 执行目标");
    expect(markdown).toContain("页面和截图证据");
    expect(markdown).toContain("影响页面");
    expect(markdown).toContain("BROKEN_IMAGE");
    expect(markdown).toContain("图片没有渲染");
    expect(markdown).toContain("SEO 技术体检");
    expect(markdown).toContain("Lighthouse 和 Core Web Vitals");
    expect(markdown).toContain("render-blocking-resources");
  });

  it("uses the markdown report as the compatibility fix prompt", () => {
    const prompt = renderFixPrompt(sampleReport);
    expect(prompt).toBe(renderMarkdown(sampleReport));
    expect(prompt).toContain("BROKEN_IMAGE");
  });

  it("renders a Chinese Kami-style html report", () => {
    const html = renderHtml(sampleReport);
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain("/r/chk_sample.md");
    expect(html).toContain("复制 Markdown");
    expect(html).toContain("shotSpread");
    expect(html).toContain("页面覆盖");
    expect(html).toContain("data-copy-target");
    expect(html).toContain("SEO 技术体检");
    expect(html).toContain("Lighthouse");
  });

  it("keeps rendering when Lighthouse returns sparse audit fields", () => {
    const sparseReport = JSON.parse(JSON.stringify(sampleReport)) as CheckReport;
    sparseReport.issues = [
      {
        code: "SCREENSHOT_FAILED",
        category: "screenshot",
        severity: "polish",
        title: "Desktop screenshot capture failed",
        message: "desktop first screen: screenshot timed out",
        evidence: { viewport: "desktop" },
        recommendation: "Check web font loading."
      }
    ];
    (sparseReport.lighthouse!.audits[0] as Record<string, unknown>).title = undefined;
    (sparseReport.lighthouse!.audits[0] as Record<string, unknown>).displayValue = undefined;

    expect(renderHtml(sparseReport)).toContain("截图采集失败");
    expect(renderMarkdown(sparseReport)).toContain("SCREENSHOT_FAILED");
  });
});
