import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = path.join(rootDir, "packages/cli/dist/checkhere.js");

let server: Awaited<ReturnType<typeof startSiteServer>>;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "checkhere-cli-"));
  server = await startSiteServer();
});

afterEach(async () => {
  await server.close();
  await rm(tempDir, { recursive: true, force: true });
});

describe("checkhere cli", () => {
  it("runs ci checks locally and writes absolute report paths", async () => {
    const outputDir = path.join(tempDir, "bundle");
    const markdownOut = path.join(tempDir, "agent-copy.md");
    const summaryOut = path.join(tempDir, "summary.json");
    const result = await runCli([
      "ci",
      server.url,
      "--fail-on=never",
      "--max-routes=0",
      "--no-lighthouse",
      "--no-seo",
      "--output-dir",
      outputDir,
      "--markdown-out",
      markdownOut,
      "--summary-out",
      summaryOut
    ]);

    expect(result.code, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload.schema_version).toBe("checkhere.cli.v4");
    expect(payload.mode).toBe("local");
    expect(payload.passed).toBe(true);
    expect(payload.pages_checked).toBe(1);
    expect(payload.html_report_path).toBe(path.join(outputDir, "report.html"));
    expect(payload.agent_markdown_path).toBe(path.join(outputDir, "report.md"));
    expect(payload.json_report_path).toBe(path.join(outputDir, "report.json"));
    expect(payload.markdown_out).toBe(markdownOut);
    expect(payload.summary_out).toBe(summaryOut);
    expect(String(payload.retry_command)).toContain("--no-lighthouse");
    await expect(readFile(path.join(outputDir, "report.html"), "utf8")).resolves.toContain("CheckHere");
    await expect(readFile(markdownOut, "utf8")).resolves.toContain("CheckHere");
    await expect(readFile(summaryOut, "utf8")).resolves.toContain("checkhere.cli.v4");
  }, 30_000);

  it("reports only local dependency checks from doctor", async () => {
    const result = await runCli(["doctor", "--json"]);
    expect(result.code, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout) as { passed: boolean; mode: string; checks: Array<{ name: string; ok: boolean }> };
    expect(payload.passed).toBe(true);
    expect(payload.mode).toBe("local");
    expect(payload.checks.some((check) => check.name === "chromium_installed" && check.ok)).toBe(true);
    expect(payload.checks.some((check) => check.name.includes("api"))).toBe(false);
  });

  it("keeps the local alias and accepts the CI setup flag", async () => {
    const help = await runCli(["setup", "--with-deps", "--help"]);
    expect(help.code, help.stderr).toBe(0);
    expect(help.stdout).toContain("checkhere setup --with-deps");
    expect(help.stdout).toContain("checkhere local <url>");
    expect(help.stdout).toContain("--routes-only");

    const version = await runCli(["--version"]);
    expect(version.code, version.stderr).toBe(0);
    expect(version.stdout.trim()).toBe("0.4.0");
  });

  it("rejects removed hosted endpoint options", async () => {
    const result = await runCli(["doctor", "--endpoint", server.url]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown option: --endpoint");
  });

  it("scans only filtered explicit routes and caps their total", async () => {
    const outputDir = path.join(tempDir, "routes-only-bundle");
    const routesPath = path.join(tempDir, "routes.txt");
    await writeFile(routesPath, "/alpha\n/ignored\n/beta\n/gamma\n");

    const result = await runCli([
      "ci",
      server.url,
      "--routes",
      routesPath,
      "--routes-only",
      "--skip=ignored",
      "--max-routes=2",
      "--fail-on=never",
      "--no-lighthouse",
      "--no-seo",
      "--output-dir",
      outputDir
    ]);

    expect(result.code, result.stderr).toBe(0);
    const payload = JSON.parse(result.stdout) as { routes_only: boolean; explicit_routes: string[]; pages_checked: number; retry_command: string };
    expect(payload.routes_only).toBe(true);
    expect(payload.explicit_routes.map((url) => new URL(url).pathname)).toEqual(["/alpha", "/beta"]);
    expect(payload.pages_checked).toBe(2);
    expect(payload.retry_command).toContain("--routes-only");

    const report = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8")) as {
      url: string;
      pages: Array<{ url: string; label: string; source: string }>;
      site: { requestedRoutes: string[]; sampledRoutes: string[] };
    };
    expect(report.url).toBe(`${server.url}/`);
    expect(report.pages.map((page) => new URL(page.url).pathname)).toEqual(["/alpha", "/beta"]);
    expect(report.pages.map((page) => page.label)).toEqual(["/alpha", "/beta"]);
    expect(report.pages.every((page) => page.source === "manual")).toBe(true);
    expect(report.site.requestedRoutes.map((url) => new URL(url).pathname)).toEqual(["/alpha", "/beta"]);
    expect(report.site.sampledRoutes).toEqual([]);
  }, 30_000);

  it("requires a route list and a positive cap for routes-only", async () => {
    const missingRoutes = await runCli(["ci", server.url, "--routes-only"]);
    expect(missingRoutes.code).toBe(2);
    expect(missingRoutes.stderr).toContain("--routes-only requires --routes <path>");

    const routesPath = path.join(tempDir, "routes.txt");
    await writeFile(routesPath, "/alpha\n");
    const zeroRoutes = await runCli(["ci", server.url, "--routes", routesPath, "--routes-only", "--max-routes=0"]);
    expect(zeroRoutes.code).toBe(2);
    expect(zeroRoutes.stderr).toContain("--max-routes must be at least 1 with --routes-only");
  });
});

async function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function startSiteServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>">
    <title>CheckHere CLI fixture</title>
  </head>
  <body><main><h1>Local browser check</h1><p>This page is rendered by the CLI test fixture.</p></main></body>
</html>`;
  const httpServer = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === "/" || request.url === "/index.html" || request.url === "/alpha" || request.url === "/beta" || request.url === "/gamma") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("missing");
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
