import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";

test.describe("daily-inspection: Task project filter + home attachment flow", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/login");
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL("/", { timeout: 5000 });
	});

	test("TaskView project filter control exists and can switch between all/none/specific project options", async ({ page }) => {
		// Open Task view via left nav
		await page.getByRole("button", { name: "任务", exact: true }).click();

		// The project filter combobox is the first one in the Task view
		const projectFilter = page.getByRole("combobox").first();

		// Verify it shows "全部项目" by default
		await expect(projectFilter).toHaveText("全部项目");

		// Open dropdown and verify mandatory options exist
		await projectFilter.click();
		await expect(page.getByRole("option", { name: "全部项目" })).toBeVisible();
		await expect(page.getByRole("option", { name: "无项目" })).toBeVisible();

		// Collect all option text contents (includes mandatory + project-specific)
		const optionTexts = await page.getByRole("option").allTextContents();
		// Exclude mandatory options to find project-specific ones
		const projectOptions = optionTexts.filter(
			(t) => t.trim() !== "全部项目" && t.trim() !== "无项目"
		);

		// Select "无项目" and verify combobox updates
		await page.getByRole("option", { name: "无项目" }).click();
		await expect(projectFilter).toHaveText("无项目");

		// If additional project options exist, select the first one and verify the combobox updates.
		// If none exist, skip this assertion so the spec remains portable across environments.
		if (projectOptions.length > 0) {
			const firstProject = projectOptions[0];
			// Re-open dropdown
			await projectFilter.click();
			await page.getByRole("option", { name: firstProject, exact: true }).click();
			await expect(projectFilter).toHaveText(firstProject);
		}
		// No else needed: all/none coverage is already verified above.
	});

	test("Home tab attachment button opens file picker and shows pending chip after file selection", async ({ page }) => {
		// Ensure on home tab
		await page.getByRole("main").locator("span").filter({ hasText: "主页" }).click();

		// Click attachment button and handle file chooser
		const [fileChooser] = await Promise.all([
			page.waitForEvent("filechooser"),
			page.getByTestId("home-attachment-btn").click(),
		]);
		await fileChooser.setFiles([{
			name: "test-attachment.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("测试附件内容 - daily inspection"),
		}]);

		// Verify pending attachment chip appears
		await expect(page.getByTestId("home-pending-attachment")).toBeVisible();
		await expect(page.getByText("test-attachment.txt")).toBeVisible();
	});
});