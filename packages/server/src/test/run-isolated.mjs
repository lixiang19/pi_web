#!/usr/bin/env node
/**
 * Per-file isolated test runner for @pi/server.
 *
 * Spawns a brand-new Node process for EVERY test file with a unique HOME
 * directory, guaranteeing complete isolation of:
 *   - module-level singletons (authRuntime, DB, activeSessions)
 *   - filesystem state (ridge-workspace, .ridge, fleeting-attachments)
 *   - SQLite DB connections and state
 *
 * This eliminates the cross-file contamination that causes intermittent
 * 401 and 404 failures when Vitest reuses fork workers.
 *
 * Usage:
 *   node src/test/run-isolated.mjs
 *   pnpm test
 *   pnpm --filter @pi/server test -- src/__tests__/fleeting-api.test.ts
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const serverRoot = path.resolve(__dirname, "../..");
const testDir = path.resolve(serverRoot, "src/__tests__");

let files;

// Parse extra CLI arguments (after the script path).
// `pnpm --filter @pi/server test -- <file>` passes the file through.
// Root `pnpm -r run test --run` passes `--run`, which we strip because
// we already invoke `vitest run`.
const extraArgs = process.argv.slice(2).filter((a) => a !== "--run" && a !== "--");

if (extraArgs.length > 0) {
  // Treat the first extra arg as a file path or glob.
  const input = extraArgs[0];
  // If the input already starts with the test directory prefix, use it directly
  // relative to serverRoot; otherwise treat it as a bare filename.
  if (input.startsWith("src/__tests__/")) {
    files = [input];
  } else {
    files = [input];
  }
} else {
  files = readdirSync(testDir)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();
}

let passed = 0;
let failed = 0;
const failures = [];

// Resolve vitest binary path from the server package
const vitestPath = path.resolve(
  serverRoot,
  "node_modules/.bin/vitest"
);

for (const file of files) {
  let absPath;
  if (path.isAbsolute(file)) {
    absPath = file;
  } else if (file.startsWith("src/__tests__/")) {
    absPath = path.join(serverRoot, file);
  } else {
    absPath = path.join(testDir, file);
  }
  const testHome = mkdtempSync(path.join(os.tmpdir(), "ridge-home-"));
  const testDbDir = mkdtempSync(path.join(os.tmpdir(), "ridge-test-"));

  console.error(`\n--- Running ${file} ---`);
  const result = spawnSync(
    vitestPath,
    ["run", absPath],
    {
      stdio: "inherit",
      cwd: serverRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "1",
        HOME: testHome,
        RIDGE_DB_PATH: path.join(testDbDir, "ridge.db"),
      },
    },
  );

  if (result.status === 0) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(file);
  }

  // Aggressive cleanup to prevent disk bloat
  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch {}
  try {
    rmSync(testDbDir, { recursive: true, force: true });
  } catch {}
}

console.error(`\n${"=".repeat(60)}`);
console.error(
  `Isolated test run complete: ${passed} passed, ${failed} failed (${files.length} total)`,
);
if (failures.length > 0) {
  console.error(`Failures: ${failures.join(", ")}`);
}
console.error(`${"=".repeat(60)}\n`);

if (failed > 0) {
  process.exit(1);
}