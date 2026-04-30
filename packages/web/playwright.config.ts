import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: /.*\.spec\.ts/,
	fullyParallel: false,
	retries: 0,
	timeout: 180000,
	use: {
		baseURL: "http://[::1]:5175",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	webServer: {
		command: "pnpm dev",
		port: 5175,
		reuseExistingServer: true,
		timeout: 15000,
	},
});
