import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launch as launchChrome } from "chrome-launcher";
import { XMLParser } from "fast-xml-parser";
import lighthouse from "lighthouse";
import type LighthouseLhr from "lighthouse/types/lhr/lhr.js";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
import {
  type BrokenImage,
  CHECKHERE_VERSION,
  type CheckIssue,
  type CheckPageResult,
  type CheckPageSource,
  type CheckReport,
  type ConsoleEntry,
  type IssueCategory,
  type IssueCode,
  type LighthouseCategoryId,
  type LighthouseMetricId,
  type LighthouseReport,
  type NetworkEntry,
  type RobotsTxtResult,
  type RouteResult,
  type SeoPageSignals,
  type SeoReport,
  REPORT_SCHEMA_VERSION,
  type Severity,
  type SiteReport,
  type SitemapResult,
  type ViewportName,
  type ViewportResult,
  validatePublicHttpUrl
} from "@checkhere/shared";

export type ScanOptions = {
  id?: string;
  outputDir: string;
  maxRoutes?: number;
  navigationTimeoutMs?: number;
  settleTimeMs?: number;
  allowPrivateHosts?: boolean;
  lighthouse?: boolean;
  seo?: boolean;
  routes?: string[];
};

type BrowserEvidence = {
  viewports: ViewportResult[];
  routes: RouteResult[];
  seo?: SeoReport;
  lighthouse?: LighthouseReport;
};

const VIEWPORTS: Array<{ name: ViewportName; width: number; height: number; isMobile: boolean }> = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true }
];

const ISSUE_DISPLAY_LIMITS: Partial<Record<IssueCode, number>> = {
  CONSOLE_ERROR: 4,
  SCREENSHOT_FAILED: 2,
  FAILED_REQUEST: 6,
  BROKEN_ASSET: 6,
  BROKEN_IMAGE: 6,
  BROKEN_LINK: 5,
  MISSING_IMAGE_ALT: 6
};

const ISSUE_PENALTY_CAPS: Partial<Record<IssueCode, number>> = {
  CONSOLE_ERROR: 20,
  SCREENSHOT_FAILED: 3,
  FAILED_REQUEST: 30,
  BROKEN_ASSET: 30,
  BROKEN_IMAGE: 30,
  BROKEN_LINK: 30,
  MISSING_FAVICON: 3,
  MISSING_TITLE: 3,
  MISSING_VIEWPORT: 10,
  MISSING_META_DESCRIPTION: 10,
  WEAK_META_DESCRIPTION: 5,
  H1_MISSING: 10,
  MULTIPLE_H1: 5,
  CANONICAL_MISSING: 5,
  CANONICAL_MISMATCH: 10,
  NOINDEX_DETECTED: 20,
  ROBOTS_BLOCKED: 20,
  SITEMAP_MISSING: 5,
  SITEMAP_INVALID: 10,
  STRUCTURED_DATA_INVALID: 10,
  OG_IMAGE_MISSING: 3,
  MISSING_IMAGE_ALT: 12,
  LIGHTHOUSE_PERFORMANCE_LOW: 10,
  CORE_WEB_VITALS_POOR: 20
};

const PLACEHOLDER_SCREENSHOT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

export async function runCheck(url: string, options: ScanOptions): Promise<CheckReport> {
  const checkedAt = new Date().toISOString();
  const id = options.id ?? `local_${Date.now().toString(36)}`;
  const validation = options.allowPrivateHosts ? { ok: true, normalizedUrl: new URL(url).toString() } : validatePublicHttpUrl(url);
  if (!validation.ok || !validation.normalizedUrl) {
    throw new Error(validation.error ?? "invalid_url");
  }

  const outputDir = path.resolve(options.outputDir);
  await mkdir(path.join(outputDir, "screenshots"), { recursive: true });
  await mkdir(path.join(outputDir, "traces"), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: false
  });

  try {
    const pagePlans = await planPages(browser, validation.normalizedUrl, outputDir, options);
    const pages: CheckPageResult[] = [];
    for (const [index, plan] of pagePlans.entries()) {
      pages.push(await scanPage(browser, plan.url, outputDir, options, plan, index));
    }

    const primary = pages[0];
    const routes = pages.slice(1).map((page) => pageToRoute(page));
    const issues = limitIssueNoise([...aggregatePageIssues(pages), ...routeIssuesForPages(pages.slice(1))]);
    const score = siteScore(pages, issues);
    const traces = ["traces/network.json", "traces/console.json", "traces/pages.json"];
    if (primary?.seo) traces.push("traces/seo.json");
    if (primary?.lighthouse) traces.push("traces/lighthouse.json");
    await writeTraceFiles(pages, outputDir);
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      appVersion: CHECKHERE_VERSION,
      id,
      url: validation.normalizedUrl,
      checkedAt,
      completedAt: new Date().toISOString(),
      status: "completed",
      result: siteResult(pages, score, issues),
      score,
      summary: summarize(issues),
      issues,
      pages,
      site: buildSiteReport(validation.normalizedUrl, pages, pagePlans),
      viewports: primary?.viewports ?? [],
      routes,
      seo: primary?.seo,
      lighthouse: primary?.lighthouse,
      artifacts: {
        reportHtml: "report.html",
        reportMarkdown: "report.md",
        reportJson: "report.json",
        fixPrompt: "fix-prompt.md",
        screenshots: pages.flatMap((page) => page.viewports.flatMap((viewport) => [viewport.screenshotPath, viewport.fullScreenshotPath])),
        traces
      }
    };
  } finally {
    await browser.close();
  }
}

type PagePlan = {
  id: string;
  label: string;
  source: CheckPageSource;
  url: string;
};

async function writeTraceFiles(pages: CheckPageResult[], outputDir: string): Promise<void> {
  const network = pages.flatMap((page) =>
    page.viewports.map((viewport) => ({
      page: page.label,
      url: page.url,
      viewport: viewport.name,
      failedRequests: viewport.failedRequests,
      errorResponses: viewport.errorResponses
    }))
  );
  const consoleEntries = pages.flatMap((page) =>
    page.viewports.map((viewport) => ({
      page: page.label,
      url: page.url,
      viewport: viewport.name,
      consoleEntries: viewport.consoleEntries,
      pageErrors: viewport.pageErrors
    }))
  );
  await writeFile(path.join(outputDir, "traces", "network.json"), `${JSON.stringify(network, null, 2)}\n`);
  await writeFile(path.join(outputDir, "traces", "console.json"), `${JSON.stringify(consoleEntries, null, 2)}\n`);
  await writeFile(path.join(outputDir, "traces", "pages.json"), `${JSON.stringify(pages, null, 2)}\n`);
  if (pages[0]?.seo) await writeFile(path.join(outputDir, "traces", "seo.json"), `${JSON.stringify(pages[0].seo, null, 2)}\n`);
  if (pages[0]?.lighthouse) {
    await writeFile(path.join(outputDir, "traces", "lighthouse.json"), `${JSON.stringify(pages[0].lighthouse, null, 2)}\n`);
  }
}

async function planPages(browser: Browser, url: string, outputDir: string, options: ScanOptions): Promise<PagePlan[]> {
  const primaryPlan: PagePlan = { id: "home", label: "首页", source: "entry", url };
  const requestedRoutes = normalizeRequestedRoutes(url, options.routes ?? [], options.allowPrivateHosts);
  const sampleBudget = Math.max(0, options.maxRoutes ?? 3);
  const sampled = sampleBudget > 0 ? await collectSampleRoutes(browser, url, options, sampleBudget, undefined) : [];
  const merged = mergePageUrls(url, requestedRoutes, sampled.slice(0, sampleBudget));
  return [
    primaryPlan,
    ...merged.map((routeUrl, index) => ({
      id: pageId(routeUrl, index + 1),
      label: routeLabel(url, routeUrl, index + 1),
      source: requestedRoutes.includes(routeUrl) ? "manual" as const : "sampled" as const,
      url: routeUrl
    }))
  ];
}

async function scanPage(
  browser: Browser,
  url: string,
  outputDir: string,
  options: ScanOptions,
  plan: PagePlan,
  index: number
): Promise<CheckPageResult> {
  const checkedAt = new Date().toISOString();
  const pageOptions: ScanOptions = {
    ...options,
    maxRoutes: 0,
    lighthouse: options.lighthouse === false ? false : index === 0
  };
  const evidence = await collectEvidence(browser, url, outputDir, pageOptions, plan.id);
  const pageIssues = annotatePageIssues(dedupeIssues(buildIssues(evidence)), plan);
  const score = scoreIssues(pageIssues);
  return {
    id: plan.id,
    label: plan.label,
    source: plan.source,
    url,
    finalUrl: evidence.viewports[0]?.finalUrl ?? url,
    checkedAt,
    completedAt: new Date().toISOString(),
    status: "completed",
    result: scoreResult(score, pageIssues),
    score,
    summary: summarize(pageIssues),
    issues: pageIssues,
    viewports: evidence.viewports,
    seo: evidence.seo,
    lighthouse: evidence.lighthouse
  };
}

async function collectEvidence(
  browser: Browser,
  url: string,
  outputDir: string,
  options: ScanOptions,
  screenshotPrefix: string
): Promise<BrowserEvidence> {
  const viewports: ViewportResult[] = [];
  for (const viewport of VIEWPORTS) {
    const result = await scanViewport(browser, url, outputDir, viewport, options, screenshotPrefix);
    viewports.push(result);
  }

  const routes = await scanRoutes(browser, url, options, viewports[0]);
  const seo = options.seo === false ? undefined : await collectSeoReport(url, options, viewports[0]);
  const lighthouseResult = options.lighthouse === false ? undefined : await runLighthouseAudit(url);
  return { viewports, routes, seo, lighthouse: lighthouseResult };
}

async function scanViewport(
  browser: Browser,
  url: string,
  outputDir: string,
  viewport: { name: ViewportName; width: number; height: number; isMobile: boolean },
  options: ScanOptions,
  screenshotPrefix: string
): Promise<ViewportResult> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    deviceScaleFactor: viewport.isMobile ? 2 : 1,
    userAgent: viewport.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 CheckHere/0.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 CheckHere/0.1"
  });
  if (!options.allowPrivateHosts) await installRequestGuard(context);
  const page = await context.newPage();
  const consoleEntries: ConsoleEntry[] = [];
  const pageErrors: string[] = [];
  const screenshotErrors: string[] = [];
  const failedRequests: NetworkEntry[] = [];
  const errorResponses: NetworkEntry[] = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const location = message.location();
      consoleEntries.push({
        type: message.type(),
        text: message.text(),
        location: location.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined
      });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failureText: request.failure()?.errorText
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      errorResponses.push({
        url: response.url(),
        status,
        resourceType: response.request().resourceType(),
        method: response.request().method()
      });
    }
  });

  let response: Response | null = null;
  try {
    response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs ?? 20_000
    });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(options.settleTimeMs ?? 800);
  } catch (error) {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  }

  const relativeScreenshot = `screenshots/${screenshotPrefix}-${viewport.name}-home.png`;
  const relativeFullScreenshot = `screenshots/${screenshotPrefix}-${viewport.name}-full.png`;
  await captureScreenshot(page, path.join(outputDir, relativeScreenshot), false, screenshotErrors, `${viewport.name} first screen`);
  await captureScreenshot(page, path.join(outputDir, relativeFullScreenshot), true, screenshotErrors, `${viewport.name} full page`);

  const dom = await page.evaluate(() => {
    const performanceNavigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const brokenImages = Array.from(document.images)
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.alt || "",
        width: image.width,
        height: image.height
      }));
    const faviconFound = Boolean(
      document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    );
    const visibleElementCount = Array.from(document.body.querySelectorAll("*")).filter((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    }).length;
    const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
    const linkHref = (selector: string) => document.querySelector<HTMLLinkElement>(selector)?.href ?? "";
    const structuredDataErrors: string[] = [];
    const structuredDataTypes = new Set<string>();
    let validStructuredData = 0;
    const collectStructuredDataTypes = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(collectStructuredDataTypes);
        return;
      }
      const record = value as Record<string, unknown>;
      const type = record["@type"];
      if (typeof type === "string") structuredDataTypes.add(type);
      if (Array.isArray(type)) {
        for (const entry of type) if (typeof entry === "string") structuredDataTypes.add(entry);
      }
      collectStructuredDataTypes(record["@graph"]);
    };
    const structuredDataScripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
    for (const script of structuredDataScripts) {
      const raw = script.textContent?.trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as unknown;
        validStructuredData += 1;
        collectStructuredDataTypes(parsed);
      } catch (error) {
        structuredDataErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const missingAltImages = Array.from(document.images)
      .filter((image) => image.width > 24 && image.height > 24 && image.alt.trim().length === 0)
      .map((image) => ({
        src: image.currentSrc || image.src,
        width: image.width,
        height: image.height
      }));

    return {
      title: document.title.trim(),
      hasViewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
      faviconFound,
      bodyTextLength: (document.body.innerText || "").trim().length,
      visibleElementCount,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      brokenImages,
      timings: {
        navigationStart: performanceNavigation?.startTime ?? 0,
        domContentLoadedMs: performanceNavigation
          ? Math.round(performanceNavigation.domContentLoadedEventEnd - performanceNavigation.startTime)
          : null,
        loadEventMs: performanceNavigation ? Math.round(performanceNavigation.loadEventEnd - performanceNavigation.startTime) : null
      },
      seo: {
        title: document.title.trim(),
        metaDescription: meta('meta[name="description"]'),
        h1Texts: Array.from(document.querySelectorAll("h1"))
          .map((heading) => heading.textContent?.trim() ?? "")
          .filter(Boolean),
        canonicalHref: linkHref('link[rel="canonical"]'),
        robotsMeta: meta('meta[name="robots"]'),
        xRobotsTag: "",
        htmlLang: document.documentElement.lang.trim(),
        openGraph: {
          title: meta('meta[property="og:title"]'),
          description: meta('meta[property="og:description"]'),
          image: meta('meta[property="og:image"]')
        },
        twitter: {
          card: meta('meta[name="twitter:card"]'),
          title: meta('meta[name="twitter:title"]'),
          description: meta('meta[name="twitter:description"]'),
          image: meta('meta[name="twitter:image"]')
        },
        structuredData: {
          count: structuredDataScripts.length,
          validCount: validStructuredData,
          invalidCount: structuredDataErrors.length,
          types: Array.from(structuredDataTypes),
          errors: structuredDataErrors.slice(0, 5)
        },
        images: {
          total: document.images.length,
          missingAltCount: missingAltImages.length,
          missingAltSamples: missingAltImages.slice(0, 6)
        }
      }
    };
  });

  const finalUrl = page.url();
  dom.seo.xRobotsTag = response?.headers()["x-robots-tag"] ?? "";
  await context.close();

  return {
    name: viewport.name,
    width: viewport.width,
    height: viewport.height,
    finalUrl,
    status: response?.status() ?? null,
    title: dom.title,
    hasViewportMeta: dom.hasViewportMeta,
    faviconFound: dom.faviconFound,
    bodyTextLength: dom.bodyTextLength,
    visibleElementCount: dom.visibleElementCount,
    documentWidth: dom.documentWidth,
    horizontalOverflowPx: Math.max(0, dom.documentWidth - viewport.width),
    screenshotPath: relativeScreenshot,
    fullScreenshotPath: relativeFullScreenshot,
    screenshotErrors,
    consoleEntries,
    pageErrors,
    failedRequests,
    errorResponses,
    brokenImages: dom.brokenImages as BrokenImage[],
    seo: dom.seo as SeoPageSignals,
    timings: dom.timings
  };
}

async function captureScreenshot(
  page: Page,
  outputPath: string,
  fullPage: boolean,
  screenshotErrors: string[],
  label: string
): Promise<void> {
  try {
    await page.screenshot({ path: outputPath, fullPage, animations: "disabled", timeout: 15_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    screenshotErrors.push(`${label}: ${message}`);
    await writeFile(outputPath, PLACEHOLDER_SCREENSHOT_PNG);
  }
}

async function scanRoutes(
  browser: Browser,
  url: string,
  options: ScanOptions,
  primaryViewport: ViewportResult | undefined
): Promise<RouteResult[]> {
  const maxRoutes = options.maxRoutes ?? 10;
  const routeUrls = await collectSampleRoutes(browser, url, options, maxRoutes, primaryViewport);
  const results: RouteResult[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (!options.allowPrivateHosts) await installRequestGuard(context);
  const page = await context.newPage();
  for (const routeUrl of routeUrls) {
    try {
      const response = await page.goto(routeUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.navigationTimeoutMs ?? 15_000
      });
      const status = response?.status() ?? null;
      results.push({ url: routeUrl, status, ok: status !== null && status < 400 });
    } catch (error) {
      results.push({
        url: routeUrl,
        status: null,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  await context.close();
  return results;
}

async function collectSampleRoutes(
  browser: Browser,
  url: string,
  options: ScanOptions,
  maxRoutes: number,
  primaryViewport: ViewportResult | undefined
): Promise<string[]> {
  if (maxRoutes <= 0 || primaryViewport?.status === null || (primaryViewport?.status ?? 0) >= 400) {
    return [];
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (!options.allowPrivateHosts) await installRequestGuard(context);
  const page = await context.newPage();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: options.navigationTimeoutMs ?? 15_000
    });
    const origin = new URL(url).origin;
    const links = await page.evaluate((pageOrigin) => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((link) => (link as HTMLAnchorElement).href)
        .filter((href) => href.startsWith(pageOrigin))
        .map((href) => {
          const parsed = new URL(href);
          parsed.hash = "";
          return parsed.toString();
        });
    }, origin);
    const unique = Array.from(new Set(links)).filter((href) => href !== url);
    return unique.slice(0, maxRoutes);
  } catch {
    return [];
  } finally {
    await context.close();
  }
}

function normalizeRequestedRoutes(entryUrl: string, routes: string[], allowPrivateHosts = false): string[] {
  const origin = new URL(entryUrl).origin;
  const normalized: string[] = [];
  for (const route of routes) {
    const trimmed = route.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let parsed: URL;
    try {
      parsed = new URL(trimmed, entryUrl);
    } catch {
      continue;
    }
    parsed.hash = "";
    if (parsed.origin !== origin) continue;
    if (!allowPrivateHosts) {
      const validation = validatePublicHttpUrl(parsed.toString());
      if (!validation.ok || !validation.normalizedUrl) continue;
      normalized.push(validation.normalizedUrl);
    } else {
      normalized.push(parsed.toString());
    }
  }
  return Array.from(new Set(normalized));
}

function mergePageUrls(entryUrl: string, requestedRoutes: string[], sampledRoutes: string[]): string[] {
  const normalizedEntry = comparableUrl(entryUrl);
  const merged: string[] = [];
  for (const route of [...requestedRoutes, ...sampledRoutes]) {
    if (comparableUrl(route) === normalizedEntry) continue;
    if (!merged.some((existing) => comparableUrl(existing) === comparableUrl(route))) merged.push(route);
  }
  return merged;
}

function pageId(url: string, index: number): string {
  const parsed = new URL(url);
  const stem = `${parsed.pathname || "page"}${parsed.search}`
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return stem ? `p${index}-${stem}` : `p${index}`;
}

function routeLabel(entryUrl: string, url: string, index: number): string {
  const parsed = new URL(url);
  const entry = new URL(entryUrl);
  if (parsed.pathname === "/" && parsed.search === "") return `页面 ${index + 1}`;
  const pathLabel = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "") || "/";
  return pathLabel === entry.pathname ? `页面 ${index + 1}` : pathLabel;
}

function pageToRoute(page: CheckPageResult): RouteResult {
  const primary = page.viewports[0];
  return {
    url: page.url,
    label: page.label,
    source: page.source === "manual" ? "manual" : "sampled",
    status: primary?.status ?? null,
    ok: page.result !== "broken" && (primary?.status ?? 0) < 400
  };
}

function annotatePageIssues(issues: CheckIssue[], plan: PagePlan): CheckIssue[] {
  return issues.map((item) => ({
    ...item,
    evidence: {
      ...(item.evidence ?? {}),
      pageLabel: plan.label,
      pageUrl: plan.url,
      pageSource: plan.source
    },
    affectedPages: [{ label: plan.label, url: plan.url }]
  }));
}

function aggregatePageIssues(pages: CheckPageResult[]): CheckIssue[] {
  const merged = new Map<string, CheckIssue>();
  for (const page of pages) {
    for (const item of page.issues) {
      const key = siteIssueKey(item);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...item,
          evidence: normalizeAggregateEvidence(item.evidence),
          affectedPages: uniqueAffectedPages(item.affectedPages ?? [{ label: page.label, url: page.url }])
        });
        continue;
      }
      existing.evidence = mergeIssueEvidence(existing.evidence, normalizeAggregateEvidence(item.evidence));
      existing.affectedPages = uniqueAffectedPages([...(existing.affectedPages ?? []), ...(item.affectedPages ?? [{ label: page.label, url: page.url }])]);
      if ((existing.affectedPages?.length ?? 0) > 1) {
        existing.evidence = {
          ...(existing.evidence ?? {}),
          affectedPageCount: existing.affectedPages?.length,
          affectedPages: existing.affectedPages?.map((affected) => affected.label)
        };
      }
    }
  }
  return limitIssueNoise([...merged.values()]);
}

function siteIssueKey(item: CheckIssue): string {
  const evidence = item.evidence ?? {};
  switch (item.code) {
    case "BROKEN_IMAGE":
    case "BROKEN_ASSET":
    case "FAILED_REQUEST":
      return `${item.code}:${String(evidence.url ?? item.message)}:${String(evidence.status ?? "")}:${String(evidence.resourceType ?? "")}`;
    case "CONSOLE_ERROR":
      return `${item.code}:${item.message}:${String(evidence.location ?? "")}`;
    case "PAGE_ERROR":
      return `${item.code}:${item.message}`;
    default:
      return `${item.code}:${normalizeIssueTitle(item.title)}:${item.message}:${JSON.stringify(stripPageEvidence(stripViewportEvidence(evidence)))}`;
  }
}

function normalizeAggregateEvidence(evidence: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!evidence) return undefined;
  const normalized = normalizeIssueEvidence(evidence);
  if (!normalized) return undefined;
  return stripPageEvidence(normalized);
}

function uniqueAffectedPages(pages: Array<{ label: string; url: string }>): Array<{ label: string; url: string }> {
  const seen = new Set<string>();
  const result: Array<{ label: string; url: string }> = [];
  for (const page of pages) {
    if (seen.has(page.url)) continue;
    seen.add(page.url);
    result.push(page);
  }
  return result;
}

function buildSiteReport(entryUrl: string, pages: CheckPageResult[], plans: PagePlan[]): SiteReport {
  const scores = pages.map((page) => page.score);
  const failedPages = pages
    .filter((page) => page.result !== "ready")
    .map((page) => ({ label: page.label, url: page.url, result: page.result, score: page.score }));
  return {
    entryUrl,
    finalUrl: pages[0]?.finalUrl ?? entryUrl,
    pagesChecked: pages.length,
    pagesReady: pages.filter((page) => page.result === "ready").length,
    pagesNeedingFixes: pages.filter((page) => page.result === "needs_fixes").length,
    pagesBroken: pages.filter((page) => page.result === "broken").length,
    averageScore: scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
    requestedRoutes: plans.filter((plan) => plan.source === "manual").map((plan) => plan.url),
    sampledRoutes: plans.filter((plan) => plan.source === "sampled").map((plan) => plan.url),
    failedPages
  };
}

function siteScore(pages: CheckPageResult[], issues: CheckIssue[]): number {
  const issueScore = scoreIssues(issues);
  const lowestPageScore = pages.length > 0 ? Math.min(...pages.map((page) => page.score)) : issueScore;
  return Math.min(issueScore, lowestPageScore);
}

function siteResult(pages: CheckPageResult[], score: number, issues: CheckIssue[]): CheckReport["result"] {
  if (pages.some((page) => page.result === "broken") || issues.some((item) => item.severity === "critical")) return "broken";
  if (pages.some((page) => page.result === "needs_fixes") || issues.some((item) => item.severity === "fix_soon") || score < 90) return "needs_fixes";
  return "ready";
}

function routeIssuesForPages(pages: CheckPageResult[]): CheckIssue[] {
  return pages
    .filter((page) => page.viewports[0]?.status === null || (page.viewports[0]?.status ?? 0) >= 400)
    .map((page) => ({
      ...issue("BROKEN_LINK", "fix_soon", "Sampled same-origin route failed", `Status ${page.viewports[0]?.status ?? "n/a"}`, {
        url: page.url,
        status: page.viewports[0]?.status ?? null,
        pageLabel: page.label,
        pageUrl: page.url,
        pageSource: page.source
      }),
      affectedPages: [{ label: page.label, url: page.url }]
    }));
}

async function collectSeoReport(url: string, options: ScanOptions, primaryViewport: ViewportResult | undefined): Promise<SeoReport> {
  const page = primaryViewport?.seo ?? emptySeoPageSignals();
  const robotsTxt = await collectRobotsTxt(url, options);
  const sitemapUrl = robotsTxt.sitemaps[0] ?? new URL("/sitemap.xml", url).toString();
  const sitemap = await collectSitemap(sitemapUrl, options);
  return { requestedUrl: url, finalUrl: primaryViewport?.finalUrl ?? url, page, robotsTxt, sitemap };
}

async function collectRobotsTxt(url: string, options: ScanOptions): Promise<RobotsTxtResult> {
  const robotsUrl = new URL("/robots.txt", url).toString();
  try {
    const response = await fetchText(robotsUrl, options, 5_000);
    if (response.status === null || response.status >= 400) {
      return {
        url: robotsUrl,
        status: response.status,
        exists: false,
        blocksHomepage: false,
        sitemaps: []
      };
    }
    const parsed = parseRobotsTxt(response.text, new URL(url).pathname || "/");
    return {
      url: robotsUrl,
      status: response.status,
      exists: true,
      blocksHomepage: parsed.blocksHomepage,
      sitemaps: parsed.sitemaps.map((sitemap) => new URL(sitemap, robotsUrl).toString())
    };
  } catch (error) {
    return {
      url: robotsUrl,
      status: null,
      exists: false,
      blocksHomepage: false,
      sitemaps: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function collectSitemap(url: string, options: ScanOptions): Promise<SitemapResult> {
  try {
    const response = await fetchText(url, options, 7_000);
    if (response.status === null || response.status >= 400) {
      return { url, status: response.status, exists: false, valid: false, urlCount: 0, errors: [] };
    }
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true
    });
    const parsed = parser.parse(response.text) as unknown;
    const result = inspectSitemapXml(parsed);
    return {
      url,
      status: response.status,
      exists: true,
      valid: result.valid,
      urlCount: result.urlCount,
      errors: result.errors
    };
  } catch (error) {
    return {
      url,
      status: null,
      exists: false,
      valid: false,
      urlCount: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

async function fetchText(
  url: string,
  options: ScanOptions,
  timeoutMs: number
): Promise<{ url: string; status: number | null; text: string }> {
  if (!options.allowPrivateHosts) {
    const validation = validatePublicHttpUrl(url);
    if (!validation.ok) throw new Error(validation.error ?? "blocked_url");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "CheckHere/0.1 SEO audit" }
    });
    return {
      url: response.url,
      status: response.status,
      text: await response.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseRobotsTxt(content: string, targetPath: string): { blocksHomepage: boolean; sitemaps: string[] } {
  type Rule = { type: "allow" | "disallow"; path: string };
  type Group = { agents: string[]; rules: Rule[] };

  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let hasRules = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap" && value) {
      sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || hasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        hasRules = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    hasRules = true;
    current.rules.push({ type: field, path: value });
  }

  const applicableRules = groups
    .filter((group) => group.agents.some((agent) => agent === "*" || agent === "googlebot"))
    .flatMap((group) => group.rules)
    .filter((rule) => rule.path.length > 0 && robotsRuleMatches(rule.path, targetPath));

  applicableRules.sort((a, b) => {
    const lengthDiff = robotsRuleSpecificity(b.path) - robotsRuleSpecificity(a.path);
    if (lengthDiff !== 0) return lengthDiff;
    if (a.type === b.type) return 0;
    return a.type === "allow" ? -1 : 1;
  });

  return {
    blocksHomepage: applicableRules[0]?.type === "disallow",
    sitemaps: Array.from(new Set(sitemaps))
  };
}

function robotsRuleMatches(rulePath: string, targetPath: string): boolean {
  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replace(/\\\$$/, "$");
  return new RegExp(`^${escaped}`).test(targetPath);
}

function robotsRuleSpecificity(rulePath: string): number {
  return rulePath.replaceAll("*", "").replaceAll("$", "").length;
}

function inspectSitemapXml(parsed: unknown): { valid: boolean; urlCount: number; errors: string[] } {
  if (!parsed || typeof parsed !== "object") return { valid: false, urlCount: 0, errors: ["XML root is missing."] };
  const record = parsed as Record<string, unknown>;
  const urlset = record.urlset as Record<string, unknown> | undefined;
  const sitemapindex = record.sitemapindex as Record<string, unknown> | undefined;
  if (urlset) {
    const urls = asArray(urlset.url);
    return {
      valid: urls.length > 0,
      urlCount: urls.length,
      errors: urls.length > 0 ? [] : ["urlset has no url entries."]
    };
  }
  if (sitemapindex) {
    const sitemaps = asArray(sitemapindex.sitemap);
    return {
      valid: sitemaps.length > 0,
      urlCount: sitemaps.length,
      errors: sitemaps.length > 0 ? [] : ["sitemapindex has no sitemap entries."]
    };
  }
  return { valid: false, urlCount: 0, errors: ["Expected urlset or sitemapindex root."] };
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

async function runLighthouseAudit(url: string): Promise<LighthouseReport> {
  const empty = emptyLighthouseReport(url);
  let chrome: Awaited<ReturnType<typeof launchChrome>> | undefined;
  try {
    chrome = await launchChrome({
      chromePath: chromium.executablePath(),
      logLevel: "error",
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--ignore-certificate-errors"]
    });
    const chromePort = chrome.port;
    const result = await withQuietLighthouseLogs(() =>
      lighthouse(url, {
        port: chromePort,
        logLevel: "error",
        output: "json",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"]
      })
    );
    if (!result?.lhr) return { ...empty, error: "Lighthouse did not return a report." };
    return summarizeLighthouse(result.lhr);
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) };
  } finally {
    chrome?.kill();
  }
}

async function withQuietLighthouseLogs<T>(operation: () => Promise<T>): Promise<T> {
  const originalWrite = process.stderr.write;
  let suppressedStackLines = 0;

  process.stderr.write = function quietLighthouseWrite(chunk: unknown, ...args: unknown[]): boolean {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (text.includes("Failed to parse source map")) {
      suppressedStackLines = 12;
      return true;
    }
    if (suppressedStackLines > 0 && /^\s+at\s/m.test(text)) {
      suppressedStackLines -= 1;
      return true;
    }
    suppressedStackLines = 0;
    return originalWrite.call(process.stderr, chunk as never, ...(args as never[]));
  } as typeof process.stderr.write;

  try {
    return await operation();
  } finally {
    process.stderr.write = originalWrite;
  }
}

function summarizeLighthouse(lhr: LighthouseLhr): LighthouseReport {
  return {
    requestedUrl: lhr.requestedUrl ?? "",
    finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl || "",
    fetchTime: lhr.fetchTime,
    lighthouseVersion: lhr.lighthouseVersion,
    categories: lighthouseCategories(lhr),
    metrics: lighthouseMetrics(lhr),
    audits: lighthouseAuditHighlights(lhr),
    warnings: lhr.runWarnings
  };
}

function lighthouseCategories(lhr: LighthouseLhr): LighthouseReport["categories"] {
  return {
    performance: lighthouseCategory(lhr, "performance"),
    accessibility: lighthouseCategory(lhr, "accessibility"),
    "best-practices": lighthouseCategory(lhr, "best-practices"),
    seo: lighthouseCategory(lhr, "seo")
  };
}

function lighthouseCategory(lhr: LighthouseLhr, id: LighthouseCategoryId): { title: string; score: number | null } {
  const category = lhr.categories[id];
  return {
    title: category?.title ?? id,
    score: category?.score ?? null
  };
}

function lighthouseMetrics(lhr: LighthouseLhr): LighthouseReport["metrics"] {
  return {
    "first-contentful-paint": lighthouseMetric(lhr, "first-contentful-paint"),
    "largest-contentful-paint": lighthouseMetric(lhr, "largest-contentful-paint"),
    "cumulative-layout-shift": lighthouseMetric(lhr, "cumulative-layout-shift"),
    "total-blocking-time": lighthouseMetric(lhr, "total-blocking-time"),
    "speed-index": lighthouseMetric(lhr, "speed-index")
  };
}

function lighthouseMetric(
  lhr: LighthouseLhr,
  id: LighthouseMetricId
): { title: string; score: number | null; numericValue: number | null; displayValue: string } {
  const audit = lhr.audits[id];
  return {
    title: audit?.title ?? id,
    score: audit?.score ?? null,
    numericValue: typeof audit?.numericValue === "number" ? audit.numericValue : null,
    displayValue: typeof audit?.displayValue === "string" ? audit.displayValue : ""
  };
}

function lighthouseAuditHighlights(lhr: LighthouseLhr): LighthouseReport["audits"] {
  const preferred = new Set([
    "render-blocking-resources",
    "unused-javascript",
    "unused-css-rules",
    "total-byte-weight",
    "uses-text-compression",
    "uses-responsive-images",
    "uses-optimized-images",
    "modern-image-formats",
    "offscreen-images",
    "server-response-time",
    "redirects",
    "font-display",
    "largest-contentful-paint-element",
    "cumulative-layout-shift",
    "third-party-summary"
  ]);
  return Object.entries(lhr.audits)
    .filter(([id, audit]) => preferred.has(id) && typeof audit.score === "number" && audit.score < 0.9)
    .sort(([, a], [, b]) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 12)
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      score: audit.score,
      displayValue: typeof audit.displayValue === "string" ? audit.displayValue : undefined,
      description: audit.description
    }));
}

function emptySeoPageSignals(): SeoPageSignals {
  return {
    title: "",
    metaDescription: "",
    h1Texts: [],
    canonicalHref: "",
    robotsMeta: "",
    xRobotsTag: "",
    htmlLang: "",
    openGraph: { title: "", description: "", image: "" },
    twitter: { card: "", title: "", description: "", image: "" },
    structuredData: { count: 0, validCount: 0, invalidCount: 0, types: [], errors: [] },
    images: { total: 0, missingAltCount: 0, missingAltSamples: [] }
  };
}

function emptyLighthouseReport(url: string): LighthouseReport {
  return {
    requestedUrl: url,
    finalUrl: url,
    fetchTime: new Date().toISOString(),
    lighthouseVersion: "unknown",
    categories: {
      performance: { title: "Performance", score: null },
      accessibility: { title: "Accessibility", score: null },
      "best-practices": { title: "Best Practices", score: null },
      seo: { title: "SEO", score: null }
    },
    metrics: {
      "first-contentful-paint": { title: "First Contentful Paint", score: null, numericValue: null, displayValue: "" },
      "largest-contentful-paint": { title: "Largest Contentful Paint", score: null, numericValue: null, displayValue: "" },
      "cumulative-layout-shift": { title: "Cumulative Layout Shift", score: null, numericValue: null, displayValue: "" },
      "total-blocking-time": { title: "Total Blocking Time", score: null, numericValue: null, displayValue: "" },
      "speed-index": { title: "Speed Index", score: null, numericValue: null, displayValue: "" }
    },
    audits: [],
    warnings: []
  };
}

async function installRequestGuard(context: BrowserContext): Promise<void> {
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    const protocol = new URL(requestUrl).protocol;
    if (protocol === "data:" || protocol === "blob:") {
      await route.continue();
      return;
    }
    const validation = validatePublicHttpUrl(requestUrl);
    if (!validation.ok) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

function buildIssues(evidence: BrowserEvidence): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const primary = evidence.viewports[0];
  if (primary?.status !== null && primary?.status !== undefined && primary.status >= 400) {
    issues.push(issue("HTTP_ERROR", "critical", "Homepage returned an HTTP error", `The first response returned ${primary.status}.`, {
      status: primary.status,
      url: primary.finalUrl
    }));
  }

  for (const viewport of evidence.viewports) {
    const prefix = viewport.name === "mobile" ? "Mobile" : "Desktop";
    if (viewport.status === null) {
      issues.push(issue("LOAD_ERROR", "critical", `${prefix} page did not finish loading`, "The browser could not complete the initial navigation.", {
        viewport: viewport.name,
        errors: viewport.pageErrors
      }));
    }
    if (viewport.bodyTextLength < 20 && viewport.visibleElementCount < 3) {
      issues.push(issue("BLANK_PAGE", "critical", `${prefix} page appears blank`, "The rendered page has very little visible content.", {
        viewport: viewport.name,
        bodyTextLength: viewport.bodyTextLength,
        visibleElementCount: viewport.visibleElementCount
      }));
    }
    if (!viewport.title) {
      issues.push(issue("MISSING_TITLE", "polish", `${prefix} page is missing a title`, "The document title is empty.", { viewport: viewport.name }));
    }
    if (!viewport.hasViewportMeta) {
      issues.push(issue("MISSING_VIEWPORT", "fix_soon", `${prefix} page is missing viewport metadata`, "Mobile browsers need a viewport meta tag for responsive layout.", {
        viewport: viewport.name
      }));
    }
    if (!viewport.faviconFound) {
      issues.push(issue("MISSING_FAVICON", "polish", `${prefix} page has no favicon link`, "The document does not expose an icon link.", { viewport: viewport.name }));
    }
    if (viewport.name === "mobile" && viewport.horizontalOverflowPx > 8) {
      issues.push(issue("MOBILE_OVERFLOW", "fix_soon", "Mobile viewport has horizontal overflow", "The document is wider than the mobile viewport.", {
        documentWidth: viewport.documentWidth,
        viewportWidth: viewport.width,
        overflowPx: viewport.horizontalOverflowPx,
        screenshot: viewport.screenshotPath
      }));
    }
    for (const entry of viewport.consoleEntries.filter((entry) => entry.type === "error").slice(0, 5)) {
      issues.push(issue("CONSOLE_ERROR", "fix_soon", `${prefix} console error`, entry.text, {
        viewport: viewport.name,
        location: entry.location
      }));
    }
    for (const pageError of viewport.pageErrors.slice(0, 5)) {
      issues.push(issue("PAGE_ERROR", "critical", `${prefix} runtime exception`, pageError, { viewport: viewport.name }));
    }
    for (const screenshotError of (viewport.screenshotErrors ?? []).slice(0, 2)) {
      issues.push(issue("SCREENSHOT_FAILED", "polish", `${prefix} screenshot capture failed`, screenshotError, {
        viewport: viewport.name,
        screenshot: viewport.screenshotPath
      }));
    }
    for (const failed of viewport.failedRequests.slice(0, 8)) {
      issues.push(issue("FAILED_REQUEST", "fix_soon", `${prefix} request failed`, failed.failureText ?? failed.url, {
        viewport: viewport.name,
        url: failed.url,
        resourceType: failed.resourceType
      }));
    }
    for (const response of viewport.errorResponses.filter(isSameOriginAsset).slice(0, 8)) {
      issues.push(issue("BROKEN_ASSET", "fix_soon", `${prefix} asset returned ${response.status}`, response.url, {
        viewport: viewport.name,
        status: response.status,
        resourceType: response.resourceType
      }));
    }
    for (const brokenImage of viewport.brokenImages.slice(0, 8)) {
      issues.push(issue("BROKEN_IMAGE", "fix_soon", `${prefix} image failed to render`, brokenImage.src, {
        viewport: viewport.name,
        alt: brokenImage.alt,
        width: brokenImage.width,
        height: brokenImage.height
      }));
    }
  }

  for (const route of evidence.routes.filter((route) => !route.ok).slice(0, 10)) {
    issues.push(issue("BROKEN_LINK", "fix_soon", "Sampled same-origin route failed", route.error ?? `Status ${route.status}`, {
      url: route.url,
      status: route.status
    }));
  }

  if (evidence.seo) issues.push(...buildSeoIssues(evidence.seo));
  if (evidence.lighthouse) issues.push(...buildLighthouseIssues(evidence.lighthouse));

  return dedupeIssues(issues);
}

function buildSeoIssues(seo: SeoReport): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const page = seo.page;
  const canonicalUrl = comparableUrl(page.canonicalHref);
  const currentUrl = comparableUrl(seo.finalUrl || seo.requestedUrl);

  if (!page.metaDescription) {
    issues.push(issue("MISSING_META_DESCRIPTION", "polish", "Page is missing a meta description", "Search snippets and shares need a clear page description.", {}));
  } else if (page.metaDescription.length < 70 || page.metaDescription.length > 170) {
    issues.push(
      issue("WEAK_META_DESCRIPTION", "polish", "Meta description length needs work", "The description should usually be concise and useful in search results.", {
        length: page.metaDescription.length
      })
    );
  }

  if (page.h1Texts.length === 0) {
    issues.push(issue("H1_MISSING", "fix_soon", "Page has no H1", "The page has no primary visible heading.", {}));
  } else if (page.h1Texts.length > 1) {
    issues.push(issue("MULTIPLE_H1", "polish", "Page has multiple H1 headings", "Multiple primary headings can make the page topic less clear.", {
      h1Texts: page.h1Texts.slice(0, 6)
    }));
  }

  if (!page.canonicalHref) {
    issues.push(issue("CANONICAL_MISSING", "polish", "Page has no canonical link", "Canonical URLs help search engines choose the preferred URL.", {}));
  } else if (canonicalUrl && currentUrl && canonicalUrl !== currentUrl) {
    issues.push(issue("CANONICAL_MISMATCH", "fix_soon", "Canonical URL points away from the checked page", "The canonical URL should usually match the current indexable page.", {
      canonical: page.canonicalHref,
      current: seo.finalUrl
    }));
  }

  if (containsNoindex(page.robotsMeta) || containsNoindex(page.xRobotsTag)) {
    issues.push(issue("NOINDEX_DETECTED", "fix_soon", "Page sends noindex", "Search engines are instructed not to index this page.", {
      robotsMeta: page.robotsMeta,
      xRobotsTag: page.xRobotsTag
    }));
  }

  if (seo.robotsTxt.exists && seo.robotsTxt.blocksHomepage) {
    issues.push(issue("ROBOTS_BLOCKED", "fix_soon", "robots.txt blocks the checked page", "Search crawlers may be blocked before they can index this URL.", {
      robotsTxt: seo.robotsTxt.url
    }));
  }

  if (!seo.sitemap.exists) {
    issues.push(issue("SITEMAP_MISSING", "polish", "Sitemap was not found", "A sitemap helps crawlers discover canonical pages.", {
      checked: seo.sitemap.url
    }));
  } else if (!seo.sitemap.valid) {
    issues.push(issue("SITEMAP_INVALID", "fix_soon", "Sitemap could not be parsed", "The sitemap exists but does not look like a valid sitemap XML document.", {
      sitemap: seo.sitemap.url,
      errors: seo.sitemap.errors
    }));
  }

  if (page.structuredData.invalidCount > 0) {
    issues.push(issue("STRUCTURED_DATA_INVALID", "fix_soon", "Structured data JSON-LD is invalid", "Invalid JSON-LD can prevent rich results from being understood.", {
      invalidCount: page.structuredData.invalidCount,
      errors: page.structuredData.errors
    }));
  }

  if (!page.openGraph.image && !page.twitter.image) {
    issues.push(issue("OG_IMAGE_MISSING", "polish", "Social share image is missing", "Open Graph or Twitter image metadata improves shared link previews.", {}));
  }

  if (page.images.missingAltCount > 0) {
    issues.push(issue("MISSING_IMAGE_ALT", "polish", "Images are missing alt text", "Meaningful images should include alt text for accessibility and image search context.", {
      missingAltCount: page.images.missingAltCount,
      samples: page.images.missingAltSamples
    }));
  }

  return issues;
}

function buildLighthouseIssues(report: LighthouseReport): CheckIssue[] {
  if (report.error) return [];
  const issues: CheckIssue[] = [];
  const performanceScore = report.categories.performance.score;
  if (performanceScore !== null && performanceScore < 0.9) {
    issues.push(issue("LIGHTHOUSE_PERFORMANCE_LOW", performanceScore < 0.5 ? "fix_soon" : "polish", "Lighthouse performance score is low", "The lab performance score is below the launch target.", {
      score: Math.round(performanceScore * 100),
      audits: report.audits.slice(0, 6).map((audit) => ({ id: audit.id, title: audit.title, displayValue: audit.displayValue }))
    }));
  }

  const lcp = report.metrics["largest-contentful-paint"].numericValue;
  const cls = report.metrics["cumulative-layout-shift"].numericValue;
  const tbt = report.metrics["total-blocking-time"].numericValue;
  const failingMetrics: Record<string, number> = {};
  if (lcp !== null && lcp > 2_500) failingMetrics.lcpMs = Math.round(lcp);
  if (cls !== null && cls > 0.1) failingMetrics.cls = Number(cls.toFixed(3));
  if (tbt !== null && tbt > 200) failingMetrics.tbtMs = Math.round(tbt);
  if (Object.keys(failingMetrics).length > 0) {
    issues.push(issue("CORE_WEB_VITALS_POOR", "fix_soon", "Core Web Vitals lab metrics need work", "Lighthouse lab metrics are outside common launch thresholds.", failingMetrics));
  }

  return issues;
}

function comparableUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    const pathname = url.pathname.endsWith("/") && url.pathname !== "/" ? url.pathname.slice(0, -1) : url.pathname;
    return `${url.protocol}//${url.host}${pathname}${url.search}`;
  } catch {
    return "";
  }
}

function containsNoindex(value: string): boolean {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("noindex");
}

function issue(
  code: CheckIssue["code"],
  severity: Severity,
  title: string,
  message: string,
  evidence: Record<string, unknown>
): CheckIssue {
  return {
    code,
    category: categoryFor(code),
    severity,
    title,
    message,
    evidence,
    recommendation: recommendationFor(code)
  };
}

function categoryFor(code: IssueCode): IssueCategory {
  switch (code) {
    case "HTTP_ERROR":
    case "LOAD_ERROR":
    case "BLANK_PAGE":
    case "CONSOLE_ERROR":
    case "PAGE_ERROR":
      return "browser";
    case "SCREENSHOT_FAILED":
      return "screenshot";
    case "FAILED_REQUEST":
      return "network";
    case "BROKEN_ASSET":
    case "BROKEN_IMAGE":
      return "assets";
    case "MOBILE_OVERFLOW":
      return "mobile";
    case "MISSING_TITLE":
    case "MISSING_VIEWPORT":
    case "MISSING_FAVICON":
      return "metadata";
    case "BROKEN_LINK":
      return "routes";
    case "MISSING_META_DESCRIPTION":
    case "WEAK_META_DESCRIPTION":
    case "H1_MISSING":
    case "MULTIPLE_H1":
    case "CANONICAL_MISSING":
    case "CANONICAL_MISMATCH":
    case "NOINDEX_DETECTED":
    case "ROBOTS_BLOCKED":
    case "SITEMAP_MISSING":
    case "SITEMAP_INVALID":
    case "STRUCTURED_DATA_INVALID":
    case "OG_IMAGE_MISSING":
    case "MISSING_IMAGE_ALT":
      return "seo";
    case "LIGHTHOUSE_PERFORMANCE_LOW":
    case "CORE_WEB_VITALS_POOR":
      return "performance";
  }
}

function recommendationFor(code: CheckIssue["code"]): string {
  switch (code) {
    case "HTTP_ERROR":
      return "Fix the deployment, route, or origin response so the URL returns a successful HTML page.";
    case "LOAD_ERROR":
      return "Reproduce the navigation in a browser and remove the blocking network or JavaScript failure.";
    case "BLANK_PAGE":
      return "Ensure the page renders meaningful visible content on first load.";
    case "CONSOLE_ERROR":
    case "PAGE_ERROR":
      return "Fix the runtime error, rebuild, redeploy, and rerun CheckHere.";
    case "SCREENSHOT_FAILED":
      return "Check web font loading, long animations, or sticky overlays that can block browser screenshot capture.";
    case "FAILED_REQUEST":
    case "BROKEN_ASSET":
      return "Correct the asset path, deployment output, or public file configuration.";
    case "BROKEN_IMAGE":
      return "Replace the missing image source or remove the broken image element.";
    case "MOBILE_OVERFLOW":
      return "Replace fixed-width layout with responsive constraints such as max-width: 100% and flexible grid tracks.";
    case "MISSING_TITLE":
      return "Add a descriptive document title.";
    case "MISSING_VIEWPORT":
      return "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.";
    case "MISSING_FAVICON":
      return "Add a favicon or app icon link.";
    case "BROKEN_LINK":
      return "Fix the internal link target or remove the link.";
    case "MISSING_META_DESCRIPTION":
      return "Add a concise meta description that explains the page and why someone should open it.";
    case "WEAK_META_DESCRIPTION":
      return "Rewrite the meta description to be useful in search results, usually around 70-170 characters.";
    case "H1_MISSING":
      return "Add one clear H1 that describes the page topic.";
    case "MULTIPLE_H1":
      return "Keep one primary H1 and downgrade secondary section headings to H2/H3.";
    case "CANONICAL_MISSING":
      return "Add a self-referencing canonical link for the preferred public URL.";
    case "CANONICAL_MISMATCH":
      return "Update the canonical URL so it matches the current indexable page.";
    case "NOINDEX_DETECTED":
      return "Remove noindex directives before launching an indexable public page.";
    case "ROBOTS_BLOCKED":
      return "Update robots.txt so the checked public page is crawlable.";
    case "SITEMAP_MISSING":
      return "Publish a sitemap.xml and reference it from robots.txt when the site has crawlable pages.";
    case "SITEMAP_INVALID":
      return "Fix sitemap XML so it contains valid urlset or sitemapindex entries.";
    case "STRUCTURED_DATA_INVALID":
      return "Fix invalid JSON-LD syntax and validate structured data after deployment.";
    case "OG_IMAGE_MISSING":
      return "Add og:image or twitter:image metadata for link previews.";
    case "MISSING_IMAGE_ALT":
      return "Add descriptive alt text to meaningful images and empty alt only for decorative images.";
    case "LIGHTHOUSE_PERFORMANCE_LOW":
      return "Use the Lighthouse audit list to reduce blocking resources, unused code, oversized assets, and slow server response.";
    case "CORE_WEB_VITALS_POOR":
      return "Improve LCP, CLS, or blocking time by optimizing hero assets, layout stability, and main-thread work.";
  }
}

function scoreIssues(issues: CheckIssue[]): number {
  const penalties = new Map<IssueCode, number>();
  for (const item of issues) {
    const issuePenalty = severityPenalty(item.severity);
    const previous = penalties.get(item.code) ?? 0;
    const cap = ISSUE_PENALTY_CAPS[item.code] ?? Number.POSITIVE_INFINITY;
    penalties.set(item.code, Math.min(cap, previous + issuePenalty));
  }
  const penalty = [...penalties.values()].reduce((total, value) => total + value, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function severityPenalty(severity: Severity): number {
  if (severity === "critical") return 30;
  if (severity === "fix_soon") return 10;
  return 3;
}

function scoreResult(score: number, issues: CheckIssue[]): CheckReport["result"] {
  if (issues.some((item) => item.severity === "critical")) return "broken";
  if (issues.some((item) => item.severity === "fix_soon") || score < 90) return "needs_fixes";
  return "ready";
}

function summarize(issues: CheckIssue[]): string {
  const critical = issues.filter((item) => item.severity === "critical").length;
  const fixSoon = issues.filter((item) => item.severity === "fix_soon").length;
  if (critical > 0) return `Found ${critical} critical issue${critical === 1 ? "" : "s"} and ${fixSoon} fix-soon issue${fixSoon === 1 ? "" : "s"}.`;
  if (fixSoon > 0) return `Found ${fixSoon} issue${fixSoon === 1 ? "" : "s"} to fix before sharing.`;
  return "The checked URL is ready to share based on the current checks.";
}

function dedupeIssues(issues: CheckIssue[]): CheckIssue[] {
  return limitIssueNoise(mergeSimilarIssues(issues));
}

function mergeSimilarIssues(issues: CheckIssue[]): CheckIssue[] {
  const merged = new Map<string, CheckIssue>();
  for (const item of issues) {
    const key = issueDedupeKey(item);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...item,
        title: normalizeIssueTitle(item.title),
        evidence: normalizeIssueEvidence(item.evidence)
      });
      continue;
    }
    existing.evidence = mergeIssueEvidence(existing.evidence, item.evidence);
  }
  return [...merged.values()];
}

function limitIssueNoise(issues: CheckIssue[]): CheckIssue[] {
  const keptByCode = new Map<IssueCode, number>();
  const lastKeptIndexByCode = new Map<IssueCode, number>();
  const omittedByCode = new Map<IssueCode, number>();
  const result: CheckIssue[] = [];

  for (const item of issues) {
    const limit = ISSUE_DISPLAY_LIMITS[item.code];
    const kept = keptByCode.get(item.code) ?? 0;
    if (limit !== undefined && kept >= limit) {
      omittedByCode.set(item.code, (omittedByCode.get(item.code) ?? 0) + 1);
      continue;
    }
    keptByCode.set(item.code, kept + 1);
    lastKeptIndexByCode.set(item.code, result.length);
    result.push(item);
  }

  for (const [code, omitted] of omittedByCode) {
    const index = lastKeptIndexByCode.get(code);
    if (index === undefined) continue;
    result[index] = {
      ...result[index],
      evidence: {
        ...(result[index].evidence ?? {}),
        omittedSimilarIssues: omitted
      }
    };
  }

  return result;
}

function issueDedupeKey(item: CheckIssue): string {
  const evidence = item.evidence ?? {};
  switch (item.code) {
    case "MISSING_FAVICON":
    case "MISSING_TITLE":
    case "MISSING_VIEWPORT":
      return `${item.code}:${item.message}`;
    case "BROKEN_IMAGE":
      return `${item.code}:${item.message}`;
    case "BROKEN_ASSET":
      return `${item.code}:${item.message}:${String(evidence.status ?? "")}:${String(evidence.resourceType ?? "")}`;
    case "FAILED_REQUEST":
      return `${item.code}:${String(evidence.url ?? item.message)}:${String(evidence.resourceType ?? "")}:${item.message}`;
    case "CONSOLE_ERROR":
      return `${item.code}:${item.message}:${String(evidence.location ?? "")}`;
    case "PAGE_ERROR":
      return `${item.code}:${item.message}`;
    default:
      return `${item.code}:${normalizeIssueTitle(item.title)}:${item.message}:${JSON.stringify(stripViewportEvidence(evidence))}`;
  }
}

function normalizeIssueTitle(title: string): string {
  const normalized = title.replace(/^(Desktop|Mobile)\s+/, "");
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
}

function normalizeIssueEvidence(evidence: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!evidence) return undefined;
  const normalized = { ...evidence };
  const viewport = normalized.viewport;
  delete normalized.viewport;
  if (typeof viewport === "string") normalized.viewports = [viewport];
  return normalized;
}

function mergeIssueEvidence(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const normalizedIncoming = normalizeIssueEvidence(incoming);
  if (!existing) return normalizedIncoming;
  if (!normalizedIncoming) return existing;
  const merged = { ...existing };
  const viewports = new Set<string>();
  for (const viewport of evidenceViewports(existing)) viewports.add(viewport);
  for (const viewport of evidenceViewports(normalizedIncoming)) viewports.add(viewport);
  for (const [key, value] of Object.entries(normalizedIncoming)) {
    if (key === "viewports") continue;
    if (merged[key] === undefined) merged[key] = value;
  }
  if (viewports.size > 0) merged.viewports = [...viewports];
  return merged;
}

function evidenceViewports(evidence: Record<string, unknown>): string[] {
  const value = evidence.viewports;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  const viewport = evidence.viewport;
  return typeof viewport === "string" ? [viewport] : [];
}

function stripViewportEvidence(evidence: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...evidence };
  delete stripped.viewport;
  delete stripped.viewports;
  return stripped;
}

function stripPageEvidence(evidence: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...evidence };
  delete stripped.pageLabel;
  delete stripped.pageUrl;
  delete stripped.pageSource;
  delete stripped.affectedPages;
  delete stripped.affectedPageCount;
  return stripped;
}

function isSameOriginAsset(entry: NetworkEntry): boolean {
  return ["script", "stylesheet", "image", "font"].includes(entry.resourceType ?? "");
}
