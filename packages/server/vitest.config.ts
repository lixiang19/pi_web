import path from "node:path";
import { defineConfig } from "vitest/config";

const preloadPath = path.resolve(__dirname, "src/test/vitest-preload.cjs");

export default defineConfig({
	root: path.resolve(__dirname),
	test: {
		globals: true,
		pool: "forks",
		// Run test files sequentially, not concurrently.
		fileParallelism: false,
		// Each test file runs in an isolated fork with fresh module cache,
		// so the global app/authRuntime singletons are recreated per file.
		isolate: true,
		// Limit concurrency within each file to 1 (sequential test execution).
		maxConcurrency: 1,
		testTimeout: 10000,
		execArgv: ["-r", preloadPath],
		setupFiles: ["./src/test/vitest-setup.ts"],
	},
});
