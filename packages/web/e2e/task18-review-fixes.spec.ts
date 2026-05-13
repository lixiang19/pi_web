import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5175";

test.describe("任务18 review fixes — cleanup & backslash path validation", () => {
	let workspaceDir: string | null = null;
	const createdFiles: string[] = [];

	test.beforeEach(async ({ page }) => {
		createdFiles.length = 0;
		// Login
		await page.goto(`${BASE_URL}/login`);
		await page.waitForLoadState("networkidle");
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.keyboard.press("Enter");
		await page.waitForURL(`${BASE_URL}/`);
		await page.waitForLoadState("networkidle");

		if (!workspaceDir) {
			const info = await page.evaluate(async () => {
				const response = await fetch("/api/system/info");
				return response.ok ? await response.json() : null;
			});
			workspaceDir = info?.workspaceDir ?? null;
		}
	});

	test.afterEach(async ({ page }) => {
		if (!workspaceDir) return;
		// Cleanup every file created by the test using DELETE with query params
		for (const filePath of createdFiles) {
			const ok = await page.evaluate(
				async ({ root, path }: { root: string; path: string }) => {
					const url = new URL("/api/files/entries", window.location.origin);
					url.searchParams.set("root", root);
					url.searchParams.set("path", path);
					const r = await fetch(url.toString(), { method: "DELETE" });
					return r.ok;
				},
				{ root: workspaceDir, path: filePath },
			);
			expect(ok, `cleanup failed for ${filePath}`).toBe(true);
		}
	});

	test("cleanup uses real created files and query params DELETE", async ({ page }) => {
		if (!workspaceDir) throw new Error("workspaceDir not resolved");
		const fileName = `task18-cleanup-test-${Date.now()}.txt`;
		const filePath = `${workspaceDir}/${fileName}`;

		// Upload file via real API
		const uploadResult = await page.evaluate(
			async ({ workspace, name }: { workspace: string; name: string }) => {
				const form = new FormData();
				form.append("root", workspace);
				form.append("directory", workspace);
				form.append("files", new Blob(["cleanup test"], { type: "text/plain" }), name);
				const r = await fetch("/api/files/upload", { method: "POST", body: form });
				return { status: r.status, body: await r.json() };
			},
			{ workspace: workspaceDir, name: fileName },
		);
		expect(uploadResult.status).toBe(201);
		createdFiles.push(filePath);

		// Verify file exists via tree API
		const tree = await page.evaluate(async ({ path }: { path: string }) => {
			const r = await fetch(`/api/workspace/files/tree?path=${encodeURIComponent(path)}`);
			return await r.json();
		}, { path: workspaceDir });
		const entry = tree.entries.find((e: { name?: string }) => e.name === fileName);
		expect(entry).toBeDefined();

		// Cleanup runs in afterEach; verify the file is gone after test
	});

	test("backslash path is rejected as 400", async ({ page }) => {
		if (!workspaceDir) throw new Error("workspaceDir not resolved");
		const result = await page.evaluate(async ({ workspace }: { workspace: string }) => {
			const url = new URL("/api/workspace/files/tree", window.location.origin);
			url.searchParams.set("path", `${workspace}\\test`);
			const r = await fetch(url.toString());
			return { status: r.status, body: await r.text() };
		}, { workspace: workspaceDir });
		expect(result.status).toBe(400);
		expect(result.body).toContain("backslash");
	});
});
