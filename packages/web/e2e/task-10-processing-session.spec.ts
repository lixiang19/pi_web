import { test, expect } from "@playwright/test";

test("task-10 processing session button presence in task detail", async ({ page }) => {
	const uniqueTitle = `验收测试任务-10-${Date.now()}`;

	await page.goto("/");

	// Login with default password
	await page.getByRole("textbox", { name: "密码" }).fill("ridge-admin");
	await page.getByRole("textbox", { name: "密码" }).press("Enter");

	// Wait for navigation to complete after login
	await page.waitForURL("/", { timeout: 10000 });

	// Navigate to tasks page
	await page.getByRole("button", { name: "任务", exact: true }).click();

	// Wait for tasks page to load
	await expect(page.getByRole("heading", { name: "任务", level: 2 })).toBeVisible();

	// Create a new task
	await page.getByRole("textbox", { name: "任务标题" }).fill(uniqueTitle);
	await page
		.getByRole("textbox", { name: "完成标准（必填）" })
		.fill("验证任务10处理会话功能");

	await page.getByRole("button", { name: "新建任务" }).click();

	// Wait for task to appear in kanban
	await expect(
		page.getByRole("button", { name: new RegExp(uniqueTitle) }),
	).toBeVisible({ timeout: 5000 });

	// Click on the task card to open detail
	await page.getByRole("button", { name: new RegExp(uniqueTitle) }).click();

	// Verify the detail dialog is open
	await expect(
		page.getByRole("dialog", { name: uniqueTitle }),
	).toBeVisible({ timeout: 5000 });

	// Scroll dialog to bottom to ensure all content is visible
	await page.evaluate(() => {
		const dialog = document.querySelector('[role="dialog"]');
		if (dialog) {
			dialog.scrollTop = dialog.scrollHeight;
		}
	});

	// Verify "开始处理" button is present
	const startProcessingBtn = page.getByRole("button", { name: "开始处理" });
	await expect(startProcessingBtn).toBeVisible({ timeout: 2000 });

	// Click "开始处理" button
	await startProcessingBtn.click();

	// Wait for a session tab to be opened (or a toast/error)
	// The button click should trigger openProcessingSession
	// which emits openSession event to WorkspacePage
	await expect(
		page.getByRole("button", { name: /继续处理/ }),
	).toBeVisible({ timeout: 5000 });
});
