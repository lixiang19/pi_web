# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: packages/web/e2e/task-10-processing-session.spec.ts >> task-10 processing session button presence in task detail
- Location: packages/web/e2e/task-10-processing-session.spec.ts:3:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("task-10 processing session button presence in task detail", async ({ page }) => {
  4  | 	const uniqueTitle = `验收测试任务-10-${Date.now()}`;
  5  | 
> 6  | 	await page.goto("/");
     |             ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  7  | 
  8  | 	// Login with default password
  9  | 	await page.getByRole("textbox", { name: "密码" }).fill("ridge-admin");
  10 | 	await page.getByRole("textbox", { name: "密码" }).press("Enter");
  11 | 
  12 | 	// Wait for navigation to complete after login
  13 | 	await page.waitForURL("/", { timeout: 10000 });
  14 | 
  15 | 	// Navigate to tasks page
  16 | 	await page.getByRole("button", { name: "任务", exact: true }).click();
  17 | 
  18 | 	// Wait for tasks page to load
  19 | 	await expect(page.getByRole("heading", { name: "任务", level: 2 })).toBeVisible();
  20 | 
  21 | 	// Create a new task
  22 | 	await page.getByRole("textbox", { name: "任务标题" }).fill(uniqueTitle);
  23 | 	await page
  24 | 		.getByRole("textbox", { name: "完成标准（必填）" })
  25 | 		.fill("验证任务10处理会话功能");
  26 | 
  27 | 	await page.getByRole("button", { name: "新建任务" }).click();
  28 | 
  29 | 	// Wait for task to appear in kanban
  30 | 	await expect(
  31 | 		page.getByRole("button", { name: new RegExp(uniqueTitle) }),
  32 | 	).toBeVisible({ timeout: 5000 });
  33 | 
  34 | 	// Click on the task card to open detail
  35 | 	await page.getByRole("button", { name: new RegExp(uniqueTitle) }).click();
  36 | 
  37 | 	// Verify the detail dialog is open
  38 | 	await expect(
  39 | 		page.getByRole("dialog", { name: uniqueTitle }),
  40 | 	).toBeVisible({ timeout: 5000 });
  41 | 
  42 | 	// Scroll dialog to bottom to ensure all content is visible
  43 | 	await page.evaluate(() => {
  44 | 		const dialog = document.querySelector('[role="dialog"]');
  45 | 		if (dialog) {
  46 | 			dialog.scrollTop = dialog.scrollHeight;
  47 | 		}
  48 | 	});
  49 | 
  50 | 	// Verify "开始处理" button is present
  51 | 	const startProcessingBtn = page.getByRole("button", { name: "开始处理" });
  52 | 	await expect(startProcessingBtn).toBeVisible({ timeout: 2000 });
  53 | 
  54 | 	// Click "开始处理" button
  55 | 	await startProcessingBtn.click();
  56 | 
  57 | 	// Wait for a session tab to be opened (or a toast/error)
  58 | 	// The button click should trigger openProcessingSession
  59 | 	// which emits openSession event to WorkspacePage
  60 | 	await expect(
  61 | 		page.getByRole("button", { name: /继续处理/ }),
  62 | 	).toBeVisible({ timeout: 5000 });
  63 | });
  64 | 
```