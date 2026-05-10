import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: /workspace-shell-tabs\.spec\.ts/,
	fullyParallel: false,
	retries: 0,
	timeout: 60000,
	use: {
		baseURL: "http://localhost:81",
		trace: "on-first-retry",
		screenshot: "on",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
