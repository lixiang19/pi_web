import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5175";

test.describe("任务18 — 文件处理状态展示与失败重试", () => {
	let workspaceDir: string | null = null;
	let createdFiles: string[] = [];

	test.beforeEach(async ({ page }) => {
		createdFiles = [];
		await page.goto(`${BASE_URL}/login`);
		await page.waitForLoadState("networkidle");
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.keyboard.press("Enter");
		await page.waitForURL(`${BASE_URL}/`);
		await page.waitForLoadState("networkidle");

		if (!workspaceDir) {
			const info = await page.evaluate(async () => {
				const r = await fetch("/api/system/info");
				return r.ok ? await r.json() : null;
			});
			workspaceDir = info?.workspaceDir ?? null;
		}
	});

	test.afterEach(async ({ page }) => {
		if (!workspaceDir) return;
		// Cleanup every file created by the test, assert success, don't silently ignore
		for (const filePath of createdFiles) {
			const ok = await page.evaluate(async ({ root, path }: { root: string; path: string }) => {
				const url = new URL("/api/files/entries", window.location.origin);
				url.searchParams.set("root", root);
				url.searchParams.set("path", path);
				const r = await fetch(url.toString(), { method: "DELETE" });
				return r.ok;
			}, { root: workspaceDir, path: filePath });
			// If cleanup fails, the test should fail so we know something is wrong
			expect(ok, `cleanup failed for ${filePath}`).toBe(true);
		}
	});

	function getTestFile() {
		if (!workspaceDir) throw new Error("workspaceDir not resolved");
		const testFile = `task18-e2e-${Date.now()}.txt`;
		const filePath = `${workspaceDir}/${testFile}`;
		return { testFile, filePath };
	}

	test("完整路径：文件上传→转换失败→失败原因可见→重试按钮可见且点击不触发文件打开", async ({ page }) => {
		const { testFile, filePath } = getTestFile();
		createdFiles.push(filePath);

		// Step 1: Upload test file via API
		const uploadResult = await page.evaluate(
			async ({ workspace, fileName }: { workspace: string; fileName: string }) => {
				const form = new FormData();
				form.append("root", workspace);
				form.append("directory", workspace);
				const blob = new Blob(["task18 e2e test content"], { type: "text/plain" });
				form.append("files", blob, fileName);
				const r = await fetch("/api/files/upload", { method: "POST", body: form });
				return { status: r.status, body: await r.json() };
			},
			{ workspace: workspaceDir!, fileName: testFile },
		);
		expect(uploadResult.status).toBe(201);
		expect(uploadResult.body.entries).toHaveLength(1);

		// Step 2: Navigate to Files view
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);
		await expect(page.getByText("工作空间").first()).toBeVisible();

		// Verify initial pending status via API
		const initialTree = await page.evaluate(async ({ path }: { path: string }) => {
			const r = await fetch(`/api/workspace/files/tree?path=${encodeURIComponent(path)}`);
			return await r.json();
		}, { path: workspaceDir! });
		const uploadedEntry = initialTree.entries.find((e: Record<string, unknown>) => e.path === filePath);
		expect(uploadedEntry).toBeDefined();
		expect(uploadedEntry.processingStatus).toBe("pending");

		// Step 3: Update to converting first, then convert_failed with error
		const setConverting = await page.evaluate(
			async ({ filePath: p }: { filePath: string }) => {
				const r = await fetch("/api/workspace/files/status", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path: p, status: "converting" }),
				});
				return r.ok;
			},
			{ filePath },
		);
		expect(setConverting).toBe(true);

		const setFailed = await page.evaluate(
			async ({ filePath: p }: { filePath: string }) => {
				const r = await fetch("/api/workspace/files/status", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						path: p,
						status: "convert_failed",
						error: "Unsupported format: this file type cannot be converted",
					}),
				});
				return r.ok;
			},
			{ filePath },
		);
		expect(setFailed).toBe(true);

		// Step 4: Reload and verify failure state in UI
		await page.reload();
		await page.waitForLoadState("networkidle");
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);
		await expect(page.getByText("工作空间").first()).toBeVisible();

		const fileRow = page.locator("[data-test='file-row']", { hasText: testFile });
		await expect(fileRow).toBeVisible();

		// Verify error message visible
		await expect(fileRow.locator("text=Unsupported format: this file type cannot be converted")).toBeVisible();

		// Verify retry button visible
		const retryButton = fileRow.getByRole("button", { name: "重试处理" });
		await expect(retryButton).toBeVisible();

		// Verify status badge shows "转换失败"
		await expect(fileRow.locator("text=转换失败")).toBeVisible();

		// Step 5: Click retry — should NOT open file (page should stay on files view).
		// In this E2E environment the Python conversion service is intentionally not configured,
		// so retry returns a visible 503 and the failed status is preserved.
		await retryButton.click();

		// Wait for API call and refresh
		await page.waitForTimeout(800);

		// Verify still on files page (no navigation to file preview/editor)
		await expect(page.getByText("工作空间").first()).toBeVisible();

		await expect(page.getByText("Python conversion service not configured")).toBeVisible();
		await expect(fileRow.locator("text=转换失败")).toBeVisible();
		await expect(fileRow.locator("text=Unsupported format: this file type cannot be converted")).toBeVisible();

		const afterRetryTree = await page.evaluate(async ({ path }: { path: string }) => {
			const r = await fetch(`/api/workspace/files/tree?path=${encodeURIComponent(path)}`);
			return await r.json();
		}, { path: workspaceDir! });
		const afterRetryEntry = afterRetryTree.entries.find((e: Record<string, unknown>) => e.path === filePath);
		expect(afterRetryEntry).toBeDefined();
		expect(afterRetryEntry.processingStatus).toBe("convert_failed");
	});

	test("index_failed 失败原因可见且可重试", async ({ page }) => {
		const { testFile, filePath } = getTestFile();
		createdFiles.push(filePath);

		// Upload file
		await page.evaluate(
			async ({ workspace, fileName }: { workspace: string; fileName: string }) => {
				const form = new FormData();
				form.append("root", workspace);
				form.append("directory", workspace);
				const blob = new Blob(["task18 e2e index failed test"], { type: "text/plain" });
				form.append("files", blob, fileName);
				await fetch("/api/files/upload", { method: "POST", body: form });
			},
			{ workspace: workspaceDir!, fileName: testFile },
		);

		// Set status: pending → converting → converted → index_failed
		await page.evaluate(
			async ({ filePath: p }: { filePath: string }) => {
				await fetch("/api/workspace/files/status", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path: p, status: "converting" }),
				});
			},
			{ filePath },
		);
		await page.evaluate(
			async ({ filePath: p }: { filePath: string }) => {
				await fetch("/api/workspace/files/status", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ path: p, status: "converted" }),
				});
			},
			{ filePath },
		);
		await page.evaluate(
			async ({ filePath: p }: { filePath: string }) => {
				await fetch("/api/workspace/files/status", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						path: p,
						status: "index_failed",
						error: "Index engine unavailable: Elasticsearch connection timeout",
					}),
				});
			},
			{ filePath },
		);

		// Navigate to Files and verify
		await page.goto(`${BASE_URL}/`);
		await page.waitForLoadState("networkidle");
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);
		await expect(page.getByText("工作空间").first()).toBeVisible();

		const fileRow = page.locator("[data-test='file-row']", { hasText: testFile });
		await expect(fileRow).toBeVisible();

		// Verify error visible
		await expect(
			fileRow.locator("text=Index engine unavailable: Elasticsearch connection timeout"),
		).toBeVisible();

		// Verify status badge
		await expect(fileRow.locator("text=索引失败")).toBeVisible();

		// Click retry
		const retryButton = fileRow.getByRole("button", { name: "重试处理" });
		await retryButton.click();
		await page.waitForTimeout(800);

		await expect(page.getByText("Python conversion service not configured")).toBeVisible();
		await expect(fileRow.locator("text=索引失败")).toBeVisible();
		await expect(
			fileRow.locator("text=Index engine unavailable: Elasticsearch connection timeout"),
		).toBeVisible();
	});

	test("文件行支持键盘 Enter/Space 打开并触发文件预览", async ({ page }) => {
		const { testFile, filePath } = getTestFile();
		createdFiles.push(filePath);

		await page.evaluate(
			async ({ workspace, fileName }: { workspace: string; fileName: string }) => {
				const form = new FormData();
				form.append("root", workspace);
				form.append("directory", workspace);
				const blob = new Blob(["keyboard test content"], { type: "text/plain" });
				form.append("files", blob, fileName);
				const r = await fetch("/api/files/upload", { method: "POST", body: form });
				return r.status;
			},
			{ workspace: workspaceDir!, fileName: testFile },
		);

		await page.goto(`${BASE_URL}/`);
		await page.waitForLoadState("networkidle");
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);
		await expect(page.getByText("工作空间").first()).toBeVisible();

		const fileRow = page.locator("[data-test='file-row']", { hasText: testFile });
		await expect(fileRow).toBeVisible();

		// Press Enter should open file preview (observable: preview/editor panel appears)
		await fileRow.focus();
		await page.keyboard.press("Enter");
		await page.waitForTimeout(500);

		// File preview is observable by checking for a tab with the file name
		await expect(page.getByRole("tab", { name: testFile })).toBeVisible();

		// Close the tab and verify Space also opens
		const closeBtn = page.locator("[data-test='close-tab-btn']").first();
		if (await closeBtn.isVisible().catch(() => false)) {
			await closeBtn.click();
			await page.waitForTimeout(300);
		}

		// Refocus files tab
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(300);
		await expect(fileRow).toBeVisible();

		await fileRow.focus();
		await page.keyboard.press(" ");
		await page.waitForTimeout(500);
		await expect(page.getByRole("tab", { name: testFile })).toBeVisible();
	});
});
