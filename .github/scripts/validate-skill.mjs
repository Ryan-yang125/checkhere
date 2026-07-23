import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const skillDir = path.resolve(process.argv[2] ?? "skills/checkhere");
const skillPath = path.join(skillDir, "SKILL.md");
const errors = [];

if (!existsSync(skillPath)) fail(`Missing ${skillPath}`);
const source = readFileSync(skillPath, "utf8");
const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatterMatch) fail("SKILL.md must begin with YAML frontmatter");

const frontmatter = frontmatterMatch[1];
const name = scalar(frontmatter, "name");
const description = scalar(frontmatter, "description");
const compatibility = scalar(frontmatter, "compatibility");
const directoryName = path.basename(skillDir);

if (!name) errors.push("frontmatter.name is required");
if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) errors.push("frontmatter.name must use lowercase letters, numbers, and single hyphens");
if (name && name.length > 64) errors.push("frontmatter.name exceeds 64 characters");
if (name && name !== directoryName) errors.push(`frontmatter.name must match parent directory ${directoryName}`);
if (!description) errors.push("frontmatter.description is required");
if (description && description.length > 1024) errors.push("frontmatter.description exceeds 1024 characters");
if (compatibility && compatibility.length > 500) errors.push("frontmatter.compatibility exceeds 500 characters");
if (source.split("\n").length > 500) errors.push("SKILL.md exceeds the recommended 500-line limit");

for (const match of source.matchAll(/\]\((references\/[^)]+)\)/g)) {
  const referencedPath = path.join(skillDir, match[1]);
  if (!existsSync(referencedPath)) errors.push(`Missing referenced file ${match[1]}`);
}

const evalsPath = path.join(skillDir, "evals", "evals.json");
if (!existsSync(evalsPath)) {
  errors.push("Missing evals/evals.json");
} else {
  try {
    const evalSet = JSON.parse(readFileSync(evalsPath, "utf8"));
    if (evalSet.skill_name !== name) errors.push("evals.skill_name must match frontmatter.name");
    if (!Array.isArray(evalSet.evals) || evalSet.evals.length < 3) {
      errors.push("evals/evals.json must contain at least three evals");
    } else {
      const ids = new Set();
      for (const evaluation of evalSet.evals) {
        if (!Number.isInteger(evaluation.id) || ids.has(evaluation.id)) errors.push("Every eval id must be a unique integer");
        ids.add(evaluation.id);
        if (!nonEmpty(evaluation.prompt)) errors.push(`Eval ${evaluation.id ?? "unknown"} requires a prompt`);
        if (!nonEmpty(evaluation.expected_output)) errors.push(`Eval ${evaluation.id ?? "unknown"} requires expected_output`);
        if (!Array.isArray(evaluation.files)) errors.push(`Eval ${evaluation.id ?? "unknown"} files must be an array`);
        if (!Array.isArray(evaluation.expectations) || evaluation.expectations.length === 0) errors.push(`Eval ${evaluation.id ?? "unknown"} requires verifiable expectations`);
      }
    }
  } catch (error) {
    errors.push(`evals/evals.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`Valid Agent Skill: ${name} (${source.split("\n").length} lines)\n`);

function scalar(block, key) {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  const value = match[1].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
