import { chmod, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.resolve(packageDir, "..");
const outfile = path.join(packageDir, "dist/checkhere.js");

await rm(path.join(packageDir, "dist"), { recursive: true, force: true });

const result = await build({
  absWorkingDir: packageDir,
  entryPoints: ["src/index.ts"],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: "#!/usr/bin/env node" },
  alias: {
    "@checkhere/reporter": path.join(packagesDir, "reporter/src/index.ts"),
    "@checkhere/scanner": path.join(packagesDir, "scanner/src/index.ts"),
    "@checkhere/shared": path.join(packagesDir, "shared/src/index.ts")
  },
  external: [
    "chrome-launcher",
    "fast-xml-parser",
    "lighthouse",
    "lighthouse/*",
    "playwright",
    "playwright/*"
  ],
  legalComments: "eof",
  metafile: true
});

const externalImports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
const leakedWorkspaceImport = externalImports.find((entry) => entry.path.startsWith("@checkhere/"));
if (leakedWorkspaceImport) {
  throw new Error(`Workspace package was left external: ${leakedWorkspaceImport.path}`);
}

await chmod(outfile, 0o755);
await copyFile(path.resolve(packageDir, "../../LICENSE"), path.join(packageDir, "dist/LICENSE"));
