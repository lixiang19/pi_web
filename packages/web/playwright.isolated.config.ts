import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: /task-09-workspace-tasks\.spec\.ts/,
	fullyParallel: false,
	retries: 0,
	timeout: 180000,
	use: {
		baseURL: "http://127.0.0.1:5186",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	webServer: [
		{
			command: "PORT=5187 pnpm --filter @pi/server run dev",
			port: 5187,
			reuseExistingServer: true,
			timeout: 30000,
		},
		{
			command: "PORT=5187 pnpm dev --port 5186 --host",
			port: 5186,
			reuseExistingServer: true,
			timeout: 30000,
		},
	],
});
