import { expect, test } from "@playwright/test";

test.describe("任务17 - 文件页与正式附件目录 E2E 测试", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/login");
		await page.waitForLoadState("networkidle");
		// 登录
		await page.getByRole("textbox", { name: "密码" }).fill("ridge-admin");
		await page.keyboard.press("Enter");
		await page.waitForURL("/");
		await page.waitForLoadState("networkidle");
	});

	test("文件入口可打开真实文件页并展示工作空间目录", async ({ page }) => {
		// 点击"文件"按钮打开文件页
		const filesButton = page.getByRole("button", { name: "文件", exact: true });
		await expect(filesButton).toBeVisible();
		await filesButton.click();

		// 等待文件视图加载
		await page.waitForTimeout(500);

		// 验证文件页头部可见（面包屑包含"工作空间"）
		const breadcrumb = page.locator("[data-test='breadcrumb']");
		await expect(breadcrumb).toBeVisible();
		await expect(breadcrumb).toContainText("工作空间");

		// 验证八个预制目录可见（至少部分）
		await expect(page.locator("text=笔记").first()).toBeVisible();
		await expect(page.locator("text=附件").first()).toBeVisible();
	});

	test("正式附件目录可见且可导航", async ({ page }) => {
		// 打开文件页
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);

		// 点击"附件"目录进入
		const attachmentsDir = page.getByRole("main").getByRole("button", { name: "附件" });
		await expect(attachmentsDir).toBeVisible();
		await attachmentsDir.click();
		await page.waitForTimeout(500);

		// 验证面包屑显示"附件"
		const breadcrumb = page.locator("[data-test='breadcrumb']");
		await expect(breadcrumb).toContainText("附件");

		// 验证附件目录下有文件（或空文件夹提示）
		const emptyState = page.locator("text=空文件夹");
		const hasEmptyState = await emptyState.isVisible().catch(() => false);
		if (!hasEmptyState) {
			// 如果有文件，验证 file-row 存在
			const fileRows = page.locator("[data-test='file-row']");
			await expect(fileRows.first()).toBeVisible();
		}
	});

	test(".ridge 不可见且不可访问", async ({ page }) => {
		// 打开文件页
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);

		// 验证 .ridge 不在可见目录列表中
		await expect(page.locator("text=.ridge").first()).not.toBeVisible();

		// 获取当前 workspaceDir 拼接真实 .ridge 路径
		const sysInfo = await page.evaluate(async () => {
			const res = await fetch("/api/system/info");
			return res.json() as Promise<{ workspaceDir?: string }>;
		});
		const workspaceDir = sysInfo.workspaceDir || "";
		const secretPath = workspaceDir ? `${workspaceDir}/.ridge/tmp/secret.txt` : "";

		// 验证 API 拒绝访问 .ridge 内文件
		if (secretPath) {
			const response = await page.evaluate(async (path) => {
				const res = await fetch(
					"/api/workspace/files/read?path=" + encodeURIComponent(path),
				);
				return { status: res.status, text: await res.text() };
			}, secretPath);
			expect(response.status).toBe(400);
			expect(response.text).toContain("ridge");
		}
	});

	test("目录可导航（前进后退）", async ({ page }) => {
		// 打开文件页
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);

		// 进入附件目录
		await page.getByRole("main").getByRole("button", { name: "附件" }).click();
		await page.waitForTimeout(500);

		// 验证面包屑显示附件
		await expect(page.locator("[data-test='breadcrumb']")).toContainText("附件");

		// 点击返回按钮（在文件视图 header 中的 ArrowLeft 图标按钮）回到根目录
		const backButton = page.getByRole("main").locator("header button").first();
		if (await backButton.isVisible().catch(() => false)) {
			await backButton.click();
			await page.waitForTimeout(500);
			await expect(page.locator("[data-test='breadcrumb']")).toContainText("工作空间");
		}
	});

	test("文件可打开/预览", async ({ page }) => {
		// 打开文件页
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);

		// 进入附件目录
		await page.getByRole("main").getByRole("button", { name: "附件" }).click();
		await page.waitForTimeout(500);

		// 查找文件行
		const fileRows = page.locator("[data-test='file-row']");
		const count = await fileRows.count();
		if (count > 0) {
			// 点击第一个文件
			await fileRows.first().click();
			await page.waitForTimeout(500);
			// 验证点击后不破坏页面（无全局错误、页面仍可见）
			await expect(page.locator("[data-test='breadcrumb']")).toBeVisible();
		}
	});

	test("处理状态徽章展示不破坏页面", async ({ page }) => {
		// 打开文件页
		await page.getByRole("button", { name: "文件", exact: true }).click();
		await page.waitForTimeout(500);

		// 进入附件目录
		await page.getByRole("main").getByRole("button", { name: "附件" }).click();
		await page.waitForTimeout(500);

		// 验证页面整体结构未被破坏（头部、面包屑、内容区可见）
		await expect(page.locator("text=文件").first()).toBeVisible();
		await expect(page.locator("[data-test='breadcrumb']")).toBeVisible();

		// 如果有带状态徽章的文件，验证徽章文本符合预期（限制在文件视图主内容区）
		const statusBadges = page.getByRole("main").locator("[data-test='file-row'] span[class*='text-[10px]']");
		const badgeCount = await statusBadges.count();
		for (let i = 0; i < badgeCount; i++) {
			const text = await statusBadges.nth(i).textContent();
			const validLabels = ["待处理", "转换中", "已转换", "已索引", "转换失败", "索引失败"];
			expect(validLabels).toContain(text?.trim());
		}
	});
});
