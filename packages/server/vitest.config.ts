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
				execArgv: ["-r", preloadPath],
			},
		},
		setupFiles: ["./src/test/vitest-setup.ts"],
	},
});
