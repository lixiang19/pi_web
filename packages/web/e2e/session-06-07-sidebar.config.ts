import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: /.*\.spec\.ts/,
	fullyParallel: false,
	retries: 0,
	timeout: 60000,
	use: {
		baseURL: "http://127.0.0.1:5178",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	webServer: {
		command: "echo 'Using pre-started server on 5178'",
		port: 5178,
		reuseExistingServer: true,
		timeout: 5000,
	},
});
