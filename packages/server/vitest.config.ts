import path from "node:path";
import { defineConfig } from "vitest/config";

const preloadPath = path.resolve(__dirname, "src/test/vitest-preload.cjs");

export default defineConfig({
	root: path.resolve(__dirname),
	test: {
		globals: true,
		pool: "forks",
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		fileParallelism: false,
		isolate: true,
		maxConcurrency: 1,
		testTimeout: 15000,
		execArgv: ["-r", preloadPath],
		setupFiles: ["./src/test/vitest-setup.ts"],
		// Ensure VITEST env is always set, even if preload script has timing issues
		env: {
			VITEST: "true",
		},
	},
});
