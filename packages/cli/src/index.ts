import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { CheckReport, Severity } from "@checkhere/shared";

type Command = "check" | "ci" | "setup" | "doctor";

type FailPolicy =
  | { kind: "never"; raw: "never" }
  | { kind: "critical"; raw: "critical" }
  | { kind: "fix_soon"; raw: "fix_soon" }
  | { kind: "score"; raw: string; minimumScore: number }
  | { kind: "page-score"; raw: string; minimumScore: number };

type Args = {
  command: Command;
  url?: string;
  json: boolean;
  open: boolean;
  help: boolean;
  version: boolean;
  withDeps: boolean;
  failOn: FailPolicy;
  markdownOut?: string;
  summaryOut?: string;
  outputDir?: string;
  routesPath?: string;
  routesOnly: boolean;
  maxRoutes: number;
  onlyPatterns: string[];
  skipPatterns: string[];
  lighthouse: boolean;
  seo: boolean;
  positionals: string[];
};

type Evaluation = {
  passed: boolean;
  failureReason?: string;
  issueCounts: Record<Severity, number>;
};

type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type OutputRecord = Record<string, unknown>;

const VERSION = "0.4.0";
const OUTPUT_SCHEMA_VERSION = "checkhere.cli.v4";
const DEFAULT_MAX_ROUTES = 3;
const COMMANDS = new Set(["check", "ci", "local", "setup", "doctor"]);
const packageRequire = createRequire(import.meta.url);
const workspaceScannerRequire = createRequire(path.resolve(dirname(fileURLToPath(import.meta.url)), "../../scanner/package.json"));

class CliError extends Error {
  constructor(message: string, public exitCode = 2) {
    super(message);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = error instanceof CliError ? error.exitCode : 2;
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (args.command === "setup") {
    await setup(args);
    return;
  }

  if (args.command === "doctor") {
    await doctor(args);
    return;
  }

  if (!args.url) {
    printHelp();
    process.exitCode = 2;
    return;
  }

  await runLocal(args);
}

function parseArgs(argv: string[]): Args {
  const first = argv[0];
  const isCi = first === "ci";
  const args: Args = {
    command: "check",
    json: isCi,
    open: false,
    help: false,
    version: false,
    withDeps: false,
    routesOnly: false,
    failOn: isCi ? parseFailPolicy("critical") : parseFailPolicy("never"),
    maxRoutes: DEFAULT_MAX_ROUTES,
    onlyPatterns: [],
    skipPatterns: [],
    lighthouse: true,
    seo: true,
    positionals: []
  };

  let startIndex = 0;
  if (first === "help" || first === "--help" || first === "-h") {
    args.help = true;
    return args;
  }
  if (first === "--version" || first === "-v" || first === "version") {
    args.version = true;
    return args;
  }
  if (first && COMMANDS.has(first)) {
    startIndex = 1;
    args.command = first === "local" ? "check" : (first as Command);
  }

  for (let index = startIndex; index < argv.length; index += 1) {
    const value = argv[index] ?? "";
    const inline = inlineOption(value);
    const option = inline.name;

    if (option === "--help" || option === "-h") args.help = true;
    else if (option === "--version" || option === "-v") args.version = true;
    else if (option === "--local") {
      // Kept as a compatibility flag. Every scan is local in v0.4.0.
    } else if (option === "--json") args.json = true;
    else if (option === "--no-json") args.json = false;
    else if (option === "--open") args.open = true;
    else if (option === "--with-deps") args.withDeps = true;
    else if (option === "--routes-only") args.routesOnly = true;
    else if (option === "--lighthouse") args.lighthouse = true;
    else if (option === "--no-lighthouse") args.lighthouse = false;
    else if (option === "--seo") args.seo = true;
    else if (option === "--no-seo") args.seo = false;
    else if (option === "--fail-on") {
      args.failOn = parseFailPolicy(inline.value ?? readValue(argv, index, value));
      if (!inline.value) index += 1;
    } else if (option === "--markdown-out") {
      args.markdownOut = inline.value ?? readValue(argv, index, value);
      if (!inline.value) index += 1;
    } else if (option === "--summary-out") {
      args.summaryOut = inline.value ?? readValue(argv, index, value);
      if (!inline.value) index += 1;
    } else if (option === "--output-dir") {
      args.outputDir = inline.value ?? readValue(argv, index, value);
      if (!inline.value) index += 1;
    } else if (option === "--routes") {
      args.routesPath = inline.value ?? readValue(argv, index, value);
      if (!inline.value) index += 1;
    } else if (option === "--max-routes") {
      args.maxRoutes = readInteger(inline.value ?? readValue(argv, index, value), value, 0, 20);
      if (!inline.value) index += 1;
    } else if (option === "--only") {
      args.onlyPatterns.push(inline.value ?? readValue(argv, index, value));
      if (!inline.value) index += 1;
    } else if (option === "--skip") {
      args.skipPatterns.push(inline.value ?? readValue(argv, index, value));
      if (!inline.value) index += 1;
    } else if (value.startsWith("-")) {
      throw new CliError(`Unknown option: ${value}`);
    } else {
      args.positionals.push(value);
    }
  }

  if (args.command === "check" || args.command === "ci") {
    args.url = args.positionals[0];
    if (args.positionals.length > 1) throw new CliError(`Unexpected argument: ${args.positionals[1]}`);
  } else if (args.positionals.length > 0) {
    throw new CliError(`Unexpected argument: ${args.positionals[0]}`);
  }

  if (args.withDeps && args.command !== "setup") throw new CliError("--with-deps is only available with checkhere setup");
  if (!args.help && args.routesOnly && args.command !== "check" && args.command !== "ci") {
    throw new CliError("--routes-only is only available with a website check");
  }
  if (!args.help && args.routesOnly && !args.routesPath) {
    throw new CliError("--routes-only requires --routes <path>");
  }
  if (!args.help && args.routesOnly && args.maxRoutes === 0) {
    throw new CliError("--max-routes must be at least 1 with --routes-only");
  }
  return args;
}

function inlineOption(value: string): { name: string; value?: string } {
  const index = value.indexOf("=");
  if (index < 0) return { name: value };
  return { name: value.slice(0, index), value: value.slice(index + 1) };
}

function readValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new CliError(`${option} requires a value`);
  return value;
}

function readInteger(raw: string, option: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new CliError(`${option} requires an integer from ${min} to ${max}`);
  return value;
}

function parseFailPolicy(raw: string): FailPolicy {
  if (raw === "never") return { kind: "never", raw };
  if (raw === "critical") return { kind: "critical", raw };
  if (raw === "fix_soon") return { kind: "fix_soon", raw };
  if (raw.startsWith("score:")) {
    const minimumScore = Number(raw.slice("score:".length));
    if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) throw new CliError("--fail-on score must use score:0..100");
    return { kind: "score", raw, minimumScore };
  }
  if (raw.startsWith("page-score:")) {
    const minimumScore = Number(raw.slice("page-score:".length));
    if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) throw new CliError("--fail-on page-score must use page-score:0..100");
    return { kind: "page-score", raw, minimumScore };
  }
  throw new CliError("--fail-on must be one of never, critical, fix_soon, score:<number>, page-score:<number>");
}

async function runLocal(args: Args): Promise<void> {
  const [{ runCheck }, { writeReportBundle }] = await Promise.all([
    import("@checkhere/scanner"),
    import("@checkhere/reporter")
  ]);
  const targetUrl = normalizeTargetUrl(args.url ?? "");
  const scanPlan = await buildScanPlan(args, targetUrl);
  const safeName = new URL(targetUrl).hostname.replace(/[^a-z0-9.-]+/gi, "-") || "site";
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.resolve(process.cwd(), "checkhere-reports", `${safeName}-${Date.now().toString(36)}`);
  await mkdir(outputDir, { recursive: true });

  let report: CheckReport;
  try {
    report = await runCheck(scanPlan.scanTargetUrl, {
      outputDir,
      allowPrivateHosts: true,
      routes: scanPlan.routes,
      maxRoutes: scanPlan.maxRoutes,
      lighthouse: args.lighthouse,
      seo: args.seo
    });
  } catch (error) {
    if (browserIsMissing(error)) {
      throw new CliError("Chromium is not installed. Run: checkhere setup");
    }
    throw error;
  }
  if (args.routesOnly) clarifyRoutesOnlyReport(report, targetUrl, scanPlan.explicitRoutes);
  await writeReportBundle(report, outputDir);

  const htmlPath = path.resolve(outputDir, "report.html");
  const markdownPath = path.resolve(outputDir, "report.md");
  const jsonPath = path.resolve(outputDir, "report.json");
  const evaluation = evaluate(report, args.failOn);
  const payload: OutputRecord = {
    schema_version: OUTPUT_SCHEMA_VERSION,
    checkhere_event: "local_completed",
    command: args.command,
    mode: "local",
    target_url: targetUrl,
    routes_only: args.routesOnly,
    explicit_routes: args.routesOnly ? scanPlan.explicitRoutes : undefined,
    result: report.result,
    score: report.score,
    passed: evaluation.passed,
    failure_reason: evaluation.failureReason,
    fail_on: args.failOn.raw,
    issue_counts: evaluation.issueCounts,
    pages_checked: report.site?.pagesChecked ?? report.pages?.length,
    failed_pages: failedPagesFor(report),
    top_blockers: topBlockersFor(report),
    html_report_path: htmlPath,
    agent_markdown_path: markdownPath,
    json_report_path: jsonPath,
    markdown_out: args.markdownOut ? await copyMarkdown(markdownPath, args.markdownOut) : undefined,
    retry_command: retryCommand(args, targetUrl),
    open_report_command: openCommand(htmlPath),
    output_dir: path.resolve(outputDir)
  };
  if (args.summaryOut) payload.summary_out = await writeSummaryOut(payload, args.summaryOut);

  outputPayload(args, payload);
  if (args.open) openPath(htmlPath);
  if (!evaluation.passed) process.exitCode = 1;
}

function normalizeTargetUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported_protocol");
    return parsed.toString();
  } catch {
    throw new CliError("URL must be a valid http:// or https:// address");
  }
}

function browserIsMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|browserType\.launch|playwright install/i.test(message);
}

async function setup(args: Args): Promise<void> {
  const cliPath = playwrightCliPath();
  const installArgs = [cliPath, "install"];
  if (args.withDeps) installArgs.push("--with-deps");
  installArgs.push("chromium");

  const exitCode = await spawnInteractive(process.execPath, installArgs);
  if (exitCode !== 0) throw new CliError(`Playwright Chromium installation failed with exit code ${exitCode}`);

  const browser = await chromiumCheck();
  if (!browser.ok) throw new CliError(`Chromium installation could not be verified: ${browser.detail}`);
  outputPayload(args, {
    schema_version: OUTPUT_SCHEMA_VERSION,
    checkhere_event: "setup_completed",
    mode: "local",
    cli_version: VERSION,
    with_deps: args.withDeps,
    chromium_executable: browser.detail,
    passed: true
  });
}

function playwrightCliPath(): string {
  try {
    const packageJsonPath = packageRequire.resolve("playwright/package.json");
    return path.join(dirname(packageJsonPath), "cli.js");
  } catch {
    throw new CliError("Playwright is unavailable. Reinstall the CheckHere package, then run: checkhere setup");
  }
}

async function doctor(args: Args): Promise<void> {
  const checks: DoctorCheck[] = [
    {
      name: "node_20_plus",
      ok: Number(process.versions.node.split(".")[0]) >= 20,
      detail: process.versions.node
    },
    { name: "platform", ok: true, detail: `${process.platform}-${process.arch}` },
    await dependencyCheck("playwright"),
    await dependencyCheck("lighthouse"),
    await dependencyCheck("chrome-launcher"),
    await dependencyCheck("fast-xml-parser"),
    await chromiumCheck(),
    await reportDirectoryCheck(args.outputDir)
  ];
  const passed = checks.every((check) => check.ok);
  const payload: OutputRecord = {
    schema_version: OUTPUT_SCHEMA_VERSION,
    checkhere_event: "doctor",
    mode: "local",
    cli_version: VERSION,
    passed,
    checks
  };

  outputPayload(args, payload);
  if (!passed) process.exitCode = 2;
}

async function dependencyCheck(packageName: string): Promise<DoctorCheck> {
  try {
    const { entryPath, resolver } = resolveDependency(packageName);
    const version = await packageVersion(packageName, entryPath, resolver);
    return { name: `${packageName}_package`, ok: true, detail: version ?? entryPath };
  } catch (error) {
    return {
      name: `${packageName}_package`,
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveDependency(packageName: string): { entryPath: string; resolver: NodeJS.Require } {
  try {
    return { entryPath: packageRequire.resolve(packageName), resolver: packageRequire };
  } catch (directError) {
    try {
      return { entryPath: workspaceScannerRequire.resolve(packageName), resolver: workspaceScannerRequire };
    } catch {
      throw directError;
    }
  }
}

async function packageVersion(packageName: string, entryPath: string, resolver: NodeJS.Require): Promise<string | undefined> {
  const candidates: string[] = [];
  try {
    candidates.push(resolver.resolve(`${packageName}/package.json`));
  } catch {
    let current = dirname(entryPath);
    for (let depth = 0; depth < 8; depth += 1) {
      candidates.push(path.join(current, "package.json"));
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  for (const candidate of candidates) {
    try {
      const data = JSON.parse(await readFile(candidate, "utf8")) as { name?: string; version?: string };
      if (data.name === packageName && data.version) return data.version;
    } catch {
      // Continue to the next parent package.json.
    }
  }
  return undefined;
}

async function chromiumCheck(): Promise<DoctorCheck> {
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    await access(executablePath, fsConstants.F_OK);
    return { name: "chromium_installed", ok: true, detail: executablePath };
  } catch (error) {
    return {
      name: "chromium_installed",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function reportDirectoryCheck(outputDir?: string): Promise<DoctorCheck> {
  const target = outputDir ? path.resolve(outputDir) : process.cwd();
  try {
    if (outputDir) await mkdir(target, { recursive: true });
    await access(target, fsConstants.W_OK);
    return { name: "report_directory_writable", ok: true, detail: target };
  } catch (error) {
    return {
      name: "report_directory_writable",
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function spawnInteractive(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function evaluate(report: CheckReport, policy: FailPolicy): Evaluation {
  const issueCounts = issueCountsFor(report);
  if (policy.kind === "never") return { passed: true, issueCounts };
  if (policy.kind === "score") {
    return report.score >= policy.minimumScore
      ? { passed: true, issueCounts }
      : { passed: false, failureReason: `score_below_${policy.minimumScore}`, issueCounts };
  }
  if (policy.kind === "page-score") {
    const pageScores = (report.pages ?? []).map((page) => page.score);
    const lowestScore = report.site?.lowestScore ?? (pageScores.length > 0 ? Math.min(...pageScores) : report.score);
    return lowestScore >= policy.minimumScore
      ? { passed: true, issueCounts }
      : { passed: false, failureReason: `page_score_below_${policy.minimumScore}`, issueCounts };
  }
  if (policy.kind === "critical") {
    if (issueCounts.critical > 0 || report.result === "broken") return { passed: false, failureReason: "critical_issues", issueCounts };
    return { passed: true, issueCounts };
  }
  if (issueCounts.critical > 0 || issueCounts.fix_soon > 0 || report.result === "broken" || report.result === "needs_fixes") {
    return { passed: false, failureReason: "fix_soon_issues", issueCounts };
  }
  return { passed: true, issueCounts };
}

async function routeList(args: Args): Promise<string[]> {
  if (!args.routesPath) return [];
  const raw = await readFile(args.routesPath, "utf8");
  const routes = raw
    .split(/\r?\n/)
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .filter(Boolean);
  return routes.filter((route) => routeMatches(route, args.onlyPatterns, args.skipPatterns));
}

type ScanPlan = {
  scanTargetUrl: string;
  routes: string[];
  maxRoutes: number;
  explicitRoutes: string[];
};

async function buildScanPlan(args: Args, targetUrl: string): Promise<ScanPlan> {
  const configuredRoutes = await routeList(args);
  if (!args.routesOnly) {
    return {
      scanTargetUrl: targetUrl,
      routes: configuredRoutes,
      maxRoutes: args.maxRoutes,
      explicitRoutes: []
    };
  }

  const explicitRoutes = normalizeExplicitRoutes(targetUrl, configuredRoutes).slice(0, args.maxRoutes);
  if (explicitRoutes.length === 0) {
    throw new CliError("--routes-only found no same-origin routes after applying filters");
  }
  return {
    scanTargetUrl: explicitRoutes[0] ?? targetUrl,
    routes: explicitRoutes.slice(1),
    maxRoutes: 0,
    explicitRoutes
  };
}

function normalizeExplicitRoutes(targetUrl: string, routes: string[]): string[] {
  const origin = new URL(targetUrl).origin;
  const normalized: string[] = [];
  for (const route of routes) {
    let parsed: URL;
    try {
      parsed = new URL(route, targetUrl);
    } catch {
      continue;
    }
    parsed.hash = "";
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) continue;
    const routeUrl = parsed.toString();
    if (!normalized.includes(routeUrl)) normalized.push(routeUrl);
  }
  return normalized;
}

function clarifyRoutesOnlyReport(report: CheckReport, targetUrl: string, explicitRoutes: string[]): void {
  const labelByUrl = new Map(explicitRoutes.map((routeUrl, index) => [comparableRouteUrl(routeUrl), explicitRouteLabel(routeUrl, index)]));
  const relabelIssue = (issue: CheckReport["issues"][number]): CheckReport["issues"][number] => {
    const affectedPages = issue.affectedPages?.map((page) => ({
      ...page,
      label: labelByUrl.get(comparableRouteUrl(page.url)) ?? page.label
    }));
    const evidence = issue.evidence ? { ...issue.evidence } : undefined;
    if (evidence && typeof evidence.pageUrl === "string") {
      evidence.pageLabel = labelByUrl.get(comparableRouteUrl(evidence.pageUrl)) ?? evidence.pageLabel;
    }
    return { ...issue, affectedPages, evidence };
  };

  for (const page of report.pages ?? []) {
    page.label = labelByUrl.get(comparableRouteUrl(page.url)) ?? page.label;
    page.source = "manual";
    page.issues = page.issues.map(relabelIssue);
  }
  report.issues = report.issues.map(relabelIssue);
  report.url = targetUrl;
  report.routes = (report.pages ?? []).map((page) => ({
    url: page.url,
    label: page.label,
    source: "manual",
    status: page.viewports[0]?.status ?? null,
    ok: page.result !== "broken" && (page.viewports[0]?.status ?? 0) < 400
  }));
  if (report.site) {
    report.site.entryUrl = targetUrl;
    report.site.requestedRoutes = [...explicitRoutes];
    report.site.sampledRoutes = [];
    report.site.failedPages = (report.pages ?? [])
      .filter((page) => page.result !== "ready")
      .map((page) => ({ label: page.label, url: page.url, result: page.result, score: page.score }));
  }
}

function comparableRouteUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function explicitRouteLabel(routeUrl: string, index: number): string {
  const parsed = new URL(routeUrl);
  return `${parsed.pathname}${parsed.search}` || `Page ${index + 1}`;
}

function routeMatches(route: string, onlyPatterns: string[], skipPatterns: string[]): boolean {
  if (onlyPatterns.length > 0 && !onlyPatterns.some((pattern) => route.includes(pattern))) return false;
  if (skipPatterns.some((pattern) => route.includes(pattern))) return false;
  return true;
}

async function writeSummaryOut(payload: OutputRecord, outputPath: string): Promise<string> {
  const resolvedPath = path.resolve(outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`);
  return resolvedPath;
}

function failedPagesFor(report: CheckReport): Array<{ label: string; url: string; result: string; score: number }> {
  if (report.site?.failedPages) return report.site.failedPages;
  return (report.pages ?? [])
    .filter((page) => page.result !== "ready")
    .map((page) => ({ label: page.label, url: page.url, result: page.result, score: page.score }));
}

function topBlockersFor(report: CheckReport): Array<{ code: string; severity: Severity; pages?: string[] }> {
  return report.issues
    .filter((issue) => issue.severity === "critical" || issue.severity === "fix_soon")
    .slice(0, 5)
    .map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      pages: issue.affectedPages?.map((page) => page.label)
    }));
}

function retryCommand(args: Args, targetUrl: string): string {
  const pieces = ["checkhere", args.command, shellQuote(targetUrl), "--fail-on", args.failOn.raw];
  if (args.outputDir) pieces.push("--output-dir", shellQuote(args.outputDir));
  if (args.routesPath) pieces.push("--routes", shellQuote(args.routesPath));
  if (args.routesOnly) pieces.push("--routes-only");
  if (args.maxRoutes !== DEFAULT_MAX_ROUTES) pieces.push("--max-routes", String(args.maxRoutes));
  for (const pattern of args.onlyPatterns) pieces.push("--only", shellQuote(pattern));
  for (const pattern of args.skipPatterns) pieces.push("--skip", shellQuote(pattern));
  if (!args.lighthouse) pieces.push("--no-lighthouse");
  if (!args.seo) pieces.push("--no-seo");
  if (args.markdownOut) pieces.push("--markdown-out", shellQuote(args.markdownOut));
  if (args.summaryOut) pieces.push("--summary-out", shellQuote(args.summaryOut));
  return pieces.join(" ");
}

function issueCountsFor(report: CheckReport): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, fix_soon: 0, polish: 0 };
  for (const issue of report.issues) counts[issue.severity] += 1;
  return counts;
}

async function copyMarkdown(sourcePath: string, outputPath: string): Promise<string> {
  const resolvedPath = path.resolve(outputPath);
  const text = await readFile(sourcePath, "utf8");
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, text);
  return resolvedPath;
}

function outputPayload(args: Args, payload: OutputRecord): void {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  printKeyValues(payload);
}

function printKeyValues(payload: OutputRecord): void {
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    const printable = typeof value === "object" && value !== null ? JSON.stringify(value) : value;
    process.stdout.write(`${key}=${printable}\n`);
  }
}

function openPath(target: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => undefined);
  child.unref();
}

function openCommand(target: string): string {
  if (process.platform === "darwin") return `open ${shellQuote(target)}`;
  if (process.platform === "win32") return `cmd /c start "" ${shellQuote(target)}`;
  return `xdg-open ${shellQuote(target)}`;
}

function shellQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function printHelp(): void {
  process.stdout.write(`CheckHere ${VERSION}

Local browser checks:
  checkhere <url>
      Run Chromium locally and write a report under ./checkhere-reports.

  checkhere ci <url>
      Run the local check for CI. Defaults to JSON output and --fail-on=critical.

  checkhere ci <url> --routes routes.txt --routes-only --max-routes=8 --fail-on=page-score:80
      Check only the first eight filtered routes. The URL resolves relative routes.

  checkhere local <url>
      Compatibility alias for checkhere <url>.

Setup and diagnostics:
  checkhere setup
      Install the Chromium build matched to this CheckHere release.

  checkhere setup --with-deps
      Install Chromium and Linux system dependencies for CI runners.

  checkhere doctor [--json]
      Check Node, local packages, Chromium, and report-directory access.

Options:
  --json                 Print JSON output.
  --no-json              Print key=value output for ci.
  --open                 Open the local HTML report after completion.
  --output-dir <path>    Write the report bundle to this directory.
  --markdown-out <path>  Copy the agent Markdown report to this path.
  --summary-out <path>   Save the final CLI JSON summary to this path.
  --routes <path>        Read release gate routes from a text file.
  --routes-only          Scan only filtered --routes pages; requires --routes.
  --max-routes <number>  Auto-sample budget, or explicit-route cap with --routes-only. Default: ${DEFAULT_MAX_ROUTES}.
  --only <text>          Include matching routes from --routes. Repeatable.
  --skip <text>          Exclude matching routes from --routes. Repeatable.
  --fail-on <policy>     never, critical, fix_soon, score:<number>, or page-score:<number>.
  --no-lighthouse        Skip Lighthouse lab metrics.
  --no-seo               Skip technical SEO checks.
  --version              Print version.
  --help                 Print this help.

Output contract:
  schema_version=checkhere.cli.v4
  html_report_path=/absolute/path/report.html
  agent_markdown_path=/absolute/path/report.md
  json_report_path=/absolute/path/report.json
  pages_checked=...
  failed_pages=...
  retry_command=...
  open_report_command=...
  passed=true|false

Open html_report_path for screenshot review. Read agent_markdown_path or
json_report_path for fixes. All website data and generated artifacts stay local.
`);
}
