import { test, expect } from "@playwright/test";

test("task-09 workspace tasks detail and status flow", async ({ page }) => {
	const uniqueTitle = `测试任务-09验收-${Date.now()}`;

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

	// Verify kanban view is active
	await expect(page.getByRole("tab", { name: "看板" })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Switch to list view
	await page.getByRole("tab", { name: "列表" }).click();
	await expect(page.getByRole("tab", { name: "列表" })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Switch back to kanban for task creation
	await page.getByRole("tab", { name: "看板" }).click();
	await expect(page.getByRole("tab", { name: "看板" })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Create a task with unique title
	await page.getByRole("textbox", { name: "任务标题" }).fill(uniqueTitle);
	await page
		.getByRole("textbox", { name: "完成标准（必填）" })
		.fill("完成09任务列表详情与状态流转的UI验收");
	await page.getByRole("button", { name: "新建任务" }).click();

	// Wait for toast notification or task to appear in kanban
	await expect(page.getByRole("button", { name: uniqueTitle })).toBeVisible({ timeout: 10000 });

	// Open task detail
	await page.getByRole("button", { name: uniqueTitle }).click();

	// Verify detail dialog opens with correct values
	await expect(
		page.getByRole("dialog", { name: uniqueTitle }),
	).toBeVisible();
	await expect(page.getByRole("textbox", { name: "标题" })).toHaveValue(
		uniqueTitle,
	);
	await expect(
		page.getByRole("textbox", { name: "完成标准" }),
	).toHaveValue("完成09任务列表详情与状态流转的UI验收");

	// Edit task details
	await page.getByRole("textbox", { name: "标题" }).fill(`${uniqueTitle}-已编辑`);
	await page.getByRole("textbox", { name: "完成标准" }).fill("验证任务创建、编辑和状态流转完整");
	// Set due date if available
	const dateInput = page.locator('input[type="date"]').first();
	if (await dateInput.isVisible().catch(() => false)) {
		await dateInput.fill("2025-05-20");
	}

	// Status change: backlog -> in_progress
	await page
		.getByRole("combobox")
		.filter({ hasText: "待处理" })
		.click();
	await page.getByRole("option", { name: "进行中" }).click();
	await page.getByRole("button", { name: "保存" }).click();
	await page.getByRole("button", { name: "Close", exact: true }).click();

	// Re-open the same task and verify its status is now in_progress
	await page.getByRole("button", { name: `${uniqueTitle}-已编辑` }).click();
	await expect(
		page.getByRole("combobox").filter({ hasText: "进行中" }),
	).toBeVisible();

	// Verify disabled options exist for invalid transitions from in_progress
	await page
		.getByRole("combobox")
		.filter({ hasText: "进行中" })
		.click();
	await expect(page.getByRole("option", { name: "待处理" })).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByRole("option", { name: "完成" })).toHaveAttribute("aria-disabled", "true");
	await page.getByRole("option", { name: "进行中" }).click(); // re-select to close dropdown

	// Status change: in_progress -> in_review
	await page
		.getByRole("combobox")
		.filter({ hasText: "进行中" })
		.click();
	await page.getByRole("option", { name: "审核中" }).click();
	await page.getByRole("button", { name: "保存" }).click();
	await page.getByRole("button", { name: "Close", exact: true }).click();

	// Re-open and verify status is in_review
	await page.getByRole("button", { name: `${uniqueTitle}-已编辑` }).click();
	await expect(
		page.getByRole("combobox").filter({ hasText: "审核中" }),
	).toBeVisible();

	// Status change: in_review -> completed
	await page
		.getByRole("combobox")
		.filter({ hasText: "审核中" })
		.click();
	await page.getByRole("option", { name: "完成" }).click();
	await page.getByRole("button", { name: "保存" }).click();
	await page.getByRole("button", { name: "Close", exact: true }).click();

	// Re-open and verify status is completed
	await page.getByRole("button", { name: `${uniqueTitle}-已编辑` }).click();
	await expect(
		page.getByRole("combobox").filter({ hasText: "完成" }),
	).toBeVisible();

	// Verify all other options are disabled from completed state
	await page
		.getByRole("combobox")
		.filter({ hasText: "完成" })
		.click();
	await expect(page.getByRole("option", { name: "待处理" })).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByRole("option", { name: "进行中" })).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByRole("option", { name: "阻塞" })).toHaveAttribute("aria-disabled", "true");
	await expect(page.getByRole("option", { name: "审核中" })).toHaveAttribute("aria-disabled", "true");
	await page.getByRole("option", { name: "完成" }).click(); // re-select to close dropdown

	await page.getByRole("button", { name: "Close", exact: true }).click();

	// Switch to calendar view
	await page.getByRole("tab", { name: "日历" }).click();
	await expect(page.getByRole("tab", { name: "日历" })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	// Switch to milestone view
	await page.getByRole("tab", { name: "里程碑" }).click();
	await expect(page.getByRole("tab", { name: "里程碑" })).toHaveAttribute(
		"aria-selected",
		"true",
	);
});
