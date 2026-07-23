export type CheckStatus = "queued" | "running" | "completed" | "failed";

export const CHECKHERE_VERSION = "0.4.0";
export const REPORT_SCHEMA_VERSION = "3.0";

export type Severity = "critical" | "fix_soon" | "polish";

export type IssueCategory = "browser" | "network" | "assets" | "mobile" | "metadata" | "routes" | "seo" | "performance" | "screenshot";

export type IssueCode =
  | "HTTP_ERROR"
  | "LOAD_ERROR"
  | "BLANK_PAGE"
  | "CONSOLE_ERROR"
  | "PAGE_ERROR"
  | "SCREENSHOT_FAILED"
  | "FAILED_REQUEST"
  | "BROKEN_ASSET"
  | "BROKEN_IMAGE"
  | "MOBILE_OVERFLOW"
  | "MISSING_TITLE"
  | "MISSING_VIEWPORT"
  | "MISSING_FAVICON"
  | "BROKEN_LINK"
  | "MISSING_META_DESCRIPTION"
  | "WEAK_META_DESCRIPTION"
  | "H1_MISSING"
  | "MULTIPLE_H1"
  | "CANONICAL_MISSING"
  | "CANONICAL_MISMATCH"
  | "NOINDEX_DETECTED"
  | "ROBOTS_BLOCKED"
  | "SITEMAP_MISSING"
  | "SITEMAP_INVALID"
  | "STRUCTURED_DATA_INVALID"
  | "OG_IMAGE_MISSING"
  | "MISSING_IMAGE_ALT"
  | "LIGHTHOUSE_PERFORMANCE_LOW"
  | "CORE_WEB_VITALS_POOR";

export type CheckIssue = {
  code: IssueCode;
  category: IssueCategory;
  severity: Severity;
  title: string;
  message: string;
  evidence?: Record<string, unknown>;
  affectedPages?: Array<{
    label: string;
    url: string;
  }>;
  recommendation: string;
};

export type ConsoleEntry = {
  type: string;
  text: string;
  location?: string;
};

export type NetworkEntry = {
  url: string;
  method?: string;
  status?: number;
  resourceType?: string;
  failureText?: string;
};

export type BrokenImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type SeoPageSignals = {
  title: string;
  metaDescription: string;
  h1Texts: string[];
  canonicalHref: string;
  robotsMeta: string;
  xRobotsTag: string;
  htmlLang: string;
  openGraph: {
    title: string;
    description: string;
    image: string;
  };
  twitter: {
    card: string;
    title: string;
    description: string;
    image: string;
  };
  structuredData: {
    count: number;
    validCount: number;
    invalidCount: number;
    types: string[];
    errors: string[];
  };
  images: {
    total: number;
    missingAltCount: number;
    missingAltSamples: Array<{
      src: string;
      width: number;
      height: number;
    }>;
  };
};

export type RobotsTxtResult = {
  url: string;
  status: number | null;
  exists: boolean;
  blocksHomepage: boolean;
  sitemaps: string[];
  error?: string;
};

export type SitemapResult = {
  url: string;
  status: number | null;
  exists: boolean;
  valid: boolean;
  urlCount: number;
  errors: string[];
};

export type SeoReport = {
  requestedUrl: string;
  finalUrl: string;
  page: SeoPageSignals;
  robotsTxt: RobotsTxtResult;
  sitemap: SitemapResult;
};

export type LighthouseCategoryId = "performance" | "accessibility" | "best-practices" | "seo";

export type LighthouseMetricId = "first-contentful-paint" | "largest-contentful-paint" | "cumulative-layout-shift" | "total-blocking-time" | "speed-index";

export type LighthouseReport = {
  requestedUrl: string;
  finalUrl: string;
  fetchTime: string;
  lighthouseVersion: string;
  categories: Record<
    LighthouseCategoryId,
    {
      title: string;
      score: number | null;
    }
  >;
  metrics: Record<
    LighthouseMetricId,
    {
      title: string;
      score: number | null;
      numericValue: number | null;
      displayValue: string;
    }
  >;
  audits: Array<{
    id: string;
    title: string;
    score: number | null;
    displayValue?: string;
    description?: string;
  }>;
  warnings: string[];
  error?: string;
};

export type ViewportName = "desktop" | "mobile";

export type ViewportResult = {
  name: ViewportName;
  width: number;
  height: number;
  finalUrl: string;
  status: number | null;
  title: string;
  hasViewportMeta: boolean;
  faviconFound: boolean;
  bodyTextLength: number;
  visibleElementCount: number;
  documentWidth: number;
  horizontalOverflowPx: number;
  screenshotPath: string;
  fullScreenshotPath: string;
  screenshotErrors?: string[];
  consoleEntries: ConsoleEntry[];
  pageErrors: string[];
  failedRequests: NetworkEntry[];
  errorResponses: NetworkEntry[];
  brokenImages: BrokenImage[];
  seo?: SeoPageSignals;
  timings: {
    navigationStart: number;
    domContentLoadedMs: number | null;
    loadEventMs: number | null;
  };
};

export type RouteResult = {
  url: string;
  status: number | null;
  ok: boolean;
  label?: string;
  source?: "manual" | "sampled";
  error?: string;
};

export type CheckPageSource = "entry" | "manual" | "sampled";

export type CheckPageResult = {
  id: string;
  label: string;
  source: CheckPageSource;
  url: string;
  finalUrl: string;
  checkedAt: string;
  completedAt: string;
  status: "completed";
  result: "ready" | "needs_fixes" | "broken";
  score: number;
  summary: string;
  issues: CheckIssue[];
  viewports: ViewportResult[];
  seo?: SeoReport;
  lighthouse?: LighthouseReport;
};

export type SiteReport = {
  entryUrl: string;
  finalUrl: string;
  pagesChecked: number;
  pagesReady: number;
  pagesNeedingFixes: number;
  pagesBroken: number;
  averageScore: number;
  lowestScore: number;
  requestedRoutes: string[];
  sampledRoutes: string[];
  failedPages: Array<{
    label: string;
    url: string;
    result: CheckPageResult["result"];
    score: number;
  }>;
};

export type CheckArtifacts = {
  reportHtml: string;
  reportMarkdown: string;
  reportJson: string;
  fixPrompt: string;
  screenshots: string[];
  traces: string[];
};

export type CheckReport = {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  appVersion: string;
  id: string;
  url: string;
  checkedAt: string;
  completedAt: string;
  status: "completed";
  result: "ready" | "needs_fixes" | "broken";
  score: number;
  summary: string;
  issues: CheckIssue[];
  pages?: CheckPageResult[];
  site?: SiteReport;
  viewports: ViewportResult[];
  routes: RouteResult[];
  seo?: SeoReport;
  lighthouse?: LighthouseReport;
  artifacts: CheckArtifacts;
};

export type CreateCheckRequest = {
  url: string;
  routes?: string[];
  maxRoutes?: number;
};

export type CreateCheckResponse = {
  id: string;
  status: CheckStatus;
  reportUrl: string;
  markdownUrl: string;
  fixPromptUrl: string;
};

export type CheckStatusResponse = {
  id: string;
  status: CheckStatus;
  result?: CheckReport["result"];
  score?: number;
  error?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  reportUrl: string;
  markdownUrl: string;
  jsonUrl: string;
  fixPromptUrl: string;
};

export type RunnerJob = {
  id: string;
  url: string;
  createdAt: string;
  leaseSeconds?: number;
  routes?: string[];
  maxRoutes?: number;
};

export type ArtifactUpload = {
  path: string;
  contentType: string;
  contentBase64: string;
};

export type CompleteCheckRequest = {
  report: CheckReport;
  artifacts?: ArtifactUpload[];
};

export type PublicUrlValidation = {
  ok: boolean;
  normalizedUrl?: string;
  error?: string;
};

const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export function makeCheckId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `chk_${now.toString(36)}_${random}`;
}

export function reportUrls(baseUrl: string, id: string): CheckStatusResponse {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return {
    id,
    status: "queued",
    reportUrl: `${normalizedBase}/r/${id}`,
    markdownUrl: `${normalizedBase}/r/${id}.md`,
    jsonUrl: `${normalizedBase}/r/${id}.json`,
    fixPromptUrl: `${normalizedBase}/r/${id}/fix-prompt.md`
  };
}

export function validatePublicHttpUrl(input: string): PublicUrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "unsupported_protocol" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "credentials_not_allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || PRIVATE_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, error: "private_hostname_not_allowed" };
  }

  if (isBlockedIpLiteral(hostname)) {
    return { ok: false, error: "private_ip_not_allowed" };
  }

  parsed.hash = "";
  return { ok: true, normalizedUrl: parsed.toString() };
}

export function isBlockedIpLiteral(hostname: string): boolean {
  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    const [a, b] = ipv4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
  }

  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) {
    return true;
  }

  return false;
}

function parseIpv4(hostname: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}
