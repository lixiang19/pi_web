#!/usr/bin/env node
/**
 * Stability test runner — runs each server test file N times in isolation
 * to identify inherently flaky tests.
 */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const serverRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const testDir = path.resolve(serverRoot, "src/__tests__");
const files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).sort();

const RUNS = 5;
const results = new Map();

for (const file of files) {
	results.set(file, { passed: 0, failed: 0 });
}

for (let run = 1; run <= RUNS; run += 1) {
	console.log(`\n=== Stability run ${run}/${RUNS} ===`);
	for (const file of files) {
		const absPath = path.join(testDir, file);
		try {
			execSync(
				`npx vitest run --run "${absPath}"`,
				{ stdio: "pipe", cwd: serverRoot, env: { ...process.env, FORCE_COLOR: "0" }, encoding: "utf8" },
			);
			results.get(file).passed += 1;
			process.stdout.write(".");
		} catch {
			results.get(file).failed += 1;
			process.stdout.write("X");
		}
	}
}

console.log("\n\n=== Stability Report ===");
const unstable = [];
for (const [file, stats] of results) {
	if (stats.failed > 0) {
		unstable.push(`${file}: ${stats.passed}/${RUNS} passed (${stats.failed} failures)`);
	}
}
if (unstable.length === 0) {
	console.log("All files stable across", RUNS, "runs!");
} else {
	console.log("Unstable files:");
	for (const line of unstable) {
		console.log("  " + line);
	}
}
