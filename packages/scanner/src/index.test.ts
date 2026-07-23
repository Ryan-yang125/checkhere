import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCheck } from "./index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixturesDir = path.join(rootDir, "fixtures");
const tempDir = path.join(rootDir, "test-results", "scanner");

let server: Awaited<ReturnType<typeof startFixtureServer>>;

beforeEach(async () => {
  server = await startFixtureServer();
});

afterEach(async () => {
  await server.close();
});

describe("runCheck", () => {
  it("passes the healthy fixture without critical issues", async () => {
    const report = await runCheck(`${server.url}/ok-site/`, {
      outputDir: path.join(tempDir, "ok-site"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    expect(report.issues.some((issue) => issue.severity === "critical")).toBe(false);
    expect(report.schemaVersion).toBe("3.0");
    expect(report.appVersion).toBe("0.4.0");
    expect(report.pages?.length).toBeGreaterThan(1);
    expect(report.site?.pagesChecked).toBe(report.pages?.length);
    expect(report.routes.some((route) => route.url.endsWith("/ok-site/about.html") && route.ok)).toBe(true);
    expect(report.seo?.page.h1Texts).toEqual(["Healthy Site"]);
  });

  it("checks explicit release gate routes", async () => {
    const report = await runCheck(`${server.url}/ok-site/`, {
      outputDir: path.join(tempDir, "routes"),
      allowPrivateHosts: true,
      lighthouse: false,
      maxRoutes: 0,
      routes: ["/ok-site/about.html"]
    });
    expect(report.pages?.map((page) => page.label)).toContain("/ok-site/about.html");
    expect(report.routes.some((route) => route.source === "manual" && route.ok)).toBe(true);
  });

  it("detects blank pages", async () => {
    const report = await runCheck(`${server.url}/blank-page/`, {
      outputDir: path.join(tempDir, "blank-page"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    expect(report.issues.some((issue) => issue.code === "BLANK_PAGE")).toBe(true);
  });

  it("detects console and page errors", async () => {
    const report = await runCheck(`${server.url}/console-error/`, {
      outputDir: path.join(tempDir, "console-error"),
      allowPrivateHosts: true,
      lighthouse: false,
      settleTimeMs: 1200
    });
    expect(report.issues.some((issue) => issue.code === "CONSOLE_ERROR")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "PAGE_ERROR")).toBe(true);
  });

  it("detects broken images", async () => {
    const report = await runCheck(`${server.url}/broken-image/`, {
      outputDir: path.join(tempDir, "broken-image"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    const brokenImages = report.issues.filter((issue) => issue.code === "BROKEN_IMAGE");
    const missingFavicons = report.issues.filter((issue) => issue.code === "MISSING_FAVICON");
    expect(brokenImages).toHaveLength(1);
    expect(brokenImages[0].category).toBe("assets");
    expect(brokenImages[0].evidence?.viewports).toEqual(["desktop", "mobile"]);
    expect(missingFavicons).toHaveLength(1);
    expect(missingFavicons[0].evidence?.viewports).toEqual(["desktop", "mobile"]);
  });

  it("caps repeated asset noise without hiding evidence", async () => {
    const report = await runCheck(`${server.url}/many-broken-images/`, {
      outputDir: path.join(tempDir, "many-broken-images"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    const brokenImages = report.issues.filter((issue) => issue.code === "BROKEN_IMAGE");
    expect(brokenImages).toHaveLength(6);
    expect(brokenImages.at(-1)?.evidence?.omittedSimilarIssues).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThan(0);
  });

  it("detects mobile horizontal overflow", async () => {
    const report = await runCheck(`${server.url}/mobile-overflow/`, {
      outputDir: path.join(tempDir, "mobile-overflow"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    expect(report.issues.some((issue) => issue.code === "MOBILE_OVERFLOW")).toBe(true);
  });

  it("detects sampled broken links", async () => {
    const report = await runCheck(`${server.url}/broken-link/`, {
      outputDir: path.join(tempDir, "broken-link"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    expect(report.issues.some((issue) => issue.code === "BROKEN_LINK")).toBe(true);
  });

  it("detects technical SEO issues", async () => {
    const report = await runCheck(`${server.url}/seo-issues/`, {
      outputDir: path.join(tempDir, "seo-issues"),
      allowPrivateHosts: true,
      lighthouse: false
    });
    expect(report.seo?.page.structuredData.invalidCount).toBe(1);
    expect(report.issues.some((issue) => issue.code === "MISSING_META_DESCRIPTION")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "H1_MISSING")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "NOINDEX_DETECTED")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "STRUCTURED_DATA_INVALID")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "MISSING_IMAGE_ALT")).toBe(true);
  });

  it("runs Lighthouse lab checks", async () => {
    const report = await runCheck(`${server.url}/ok-site/`, {
      outputDir: path.join(tempDir, "lighthouse"),
      allowPrivateHosts: true,
      maxRoutes: 0,
      lighthouse: true
    });
    expect(report.lighthouse).toBeDefined();
    expect(report.lighthouse?.error).toBeUndefined();
    expect(report.lighthouse?.categories.performance.score).not.toBeNull();
    expect(report.lighthouse?.metrics["largest-contentful-paint"].numericValue).not.toBeNull();
  }, 45_000);
});

async function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const httpServer = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const normalized = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const filePath = path.normalize(path.join(fixturesDir, normalized));
    if (!filePath.startsWith(fixturesDir)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("fixture_server_failed");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
