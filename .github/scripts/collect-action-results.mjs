import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [artifactDirArg, exitStatusArg = "2", artifactName = "checkhere-report"] = process.argv.slice(2);
if (!artifactDirArg) {
  process.stderr.write("collect-action-results requires an artifact directory\n");
  process.exit(2);
}

const artifactDir = path.resolve(artifactDirArg);
const summaryPath = path.join(artifactDir, "summary.json");
const reportDir = path.join(artifactDir, "report");
let summary = {};
let parseError = "";

if (existsSync(summaryPath)) {
  try {
    summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
}

const sourceDir = stringValue(summary.output_dir);
if (sourceDir && existsSync(sourceDir)) {
  mkdirSync(reportDir, { recursive: true });
  cpSync(sourceDir, reportDir, { recursive: true });
}

const htmlReport = existingPath(path.join(reportDir, "report.html"), stringValue(summary.html_report_path));
const markdownReport = existingPath(path.join(reportDir, "report.md"), path.join(artifactDir, "report.md"), stringValue(summary.agent_markdown_path));
const jsonReport = existingPath(path.join(reportDir, "report.json"), stringValue(summary.json_report_path));
const passed = typeof summary.passed === "boolean" ? String(summary.passed) : exitStatusArg === "0" ? "true" : "false";
const score = Number.isFinite(summary.score) ? String(summary.score) : "";

writeOutputs({
  passed,
  score,
  "html-report": htmlReport,
  "markdown-report": markdownReport,
  "json-report": jsonReport,
  "report-directory": reportDir
});

const lines = [
  "## CheckHere release gate",
  "",
  "| Target | Gate | Result | Score |",
  "| --- | --- | --- | ---: |",
  `| ${markdownCell(summary.target_url ?? "unknown")} | \`${inlineCode(summary.fail_on ?? "unknown")}\` | **${passed === "true" ? "passed" : "failed"}** | ${score || "n/a"} |`,
  "",
  `Report artifact: \`${inlineCode(artifactName)}\``
];

const counts = objectValue(summary.issue_counts);
if (counts) {
  lines.push("", "### Issue counts", "", `- Critical: ${numberValue(counts.critical)}`, `- Fix soon: ${numberValue(counts.fix_soon)}`, `- Polish: ${numberValue(counts.polish)}`);
}

const blockers = Array.isArray(summary.top_blockers) ? summary.top_blockers : [];
if (blockers.length > 0) {
  lines.push("", "### Top blockers", "");
  for (const blocker of blockers.slice(0, 10)) {
    const code = inlineCode(blocker?.code ?? "UNKNOWN");
    const severity = inlineCode(blocker?.severity ?? "unknown");
    const pages = Array.isArray(blocker?.pages) && blocker.pages.length > 0 ? ` — ${blocker.pages.map(markdownText).join(", ")}` : "";
    lines.push(`- \`${code}\` (${severity})${pages}`);
  }
}

if (parseError) {
  lines.push("", `The CLI summary could not be parsed: \`${inlineCode(parseError)}\``);
} else if (!existsSync(summaryPath)) {
  lines.push("", "The CLI stopped before it wrote a structured summary. Inspect the uploaded CLI logs.");
}

lines.push("", "Download the artifact to open `report/report.html` and inspect its desktop and mobile screenshots.", "");
const renderedSummary = `${lines.join("\n")}\n`;
writeFileSync(path.join(artifactDir, "job-summary.md"), renderedSummary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderedSummary);

function existingPath(...candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return path.resolve(candidate);
  }
  return "";
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : "";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function numberValue(value) {
  return Number.isFinite(value) ? value : 0;
}

function markdownText(value) {
  return String(value ?? "").replace(/[\r\n|]/g, " ").replace(/[<>]/g, "");
}

function markdownCell(value) {
  return markdownText(value) || "unknown";
}

function inlineCode(value) {
  return String(value ?? "").replace(/[\r\n`]/g, " ");
}

function writeOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const [key, value] of Object.entries(values)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value).replace(/[\r\n]/g, "")}\n`);
  }
}
