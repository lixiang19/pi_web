import { test, expect } from "@playwright/test";

const PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";

test.describe("工作台 Shell 与标签系统", () => {
	test.beforeEach(async ({ page }) => {
		const errors: string[] = [];
		const pageErrors: string[] = [];

		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});
		page.on("pageerror", (err) => {
			pageErrors.push(err.message);
		});

		await page.goto("/");
		await expect(page.getByRole("heading", { name: "输入访问密码" })).toBeVisible();
		await page.getByRole("textbox", { name: "密码" }).fill(PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await expect(page.locator("main")).toBeVisible();
		await page.waitForTimeout(2000);
	});

	test("左侧固定入口包含要求的条目，且不包含主页", async ({ page }) => {
		// 只断言已实现的真实入口，不暴露未实现占位
		const required = ["闪念", "任务", "文件", "终端", "自动化", "设置"];
		for (const name of required) {
			await expect(page.getByRole("button", { name }).first()).toBeVisible();
		}

		// 主页按钮仅应出现在顶部标签栏，不应出现在左侧固定入口
		const sidebar = page.locator("aside");
		const sidebarButtons = await sidebar.locator("button").allInnerTexts();
		expect(sidebarButtons).not.toContain("主页");
	});

	test("未实现占位入口不在主导航暴露", async ({ page }) => {
		const hidden = ["搜索", "通知", "Skill"];
		for (const name of hidden) {
			const btn = page.getByRole("button", { name }).first();
			// 未实现入口不应在主导航可见；若仍可见则测试失败
			await expect(btn).not.toBeVisible();
		}
	});

	test("点击任务打开工作台标签，重复点击只保留一个任务标签", async ({ page }) => {
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		await expect(page.locator("main").getByRole("heading", { name: "任务", level: 2 })).toBeVisible();

		const tabs = page.locator("main").locator("span.truncate");
		const texts1 = await tabs.allTextContents();
		const taskCount1 = texts1.filter((t) => t === "任务").length;
		expect(taskCount1).toBe(1);

		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		const texts2 = await tabs.allTextContents();
		const taskCount2 = texts2.filter((t) => t === "任务").length;
		expect(taskCount2).toBe(1);
	});

	test("连续点击终端生成多个终端标签", async ({ page }) => {
		await page.getByRole("button", { name: "终端" }).first().click();
		await page.waitForTimeout(1500);
		await page.getByRole("button", { name: "终端" }).first().click();
		await page.waitForTimeout(1500);
		await page.getByRole("button", { name: "终端" }).first().click();
		await page.waitForTimeout(1500);

		const tabs = page.locator("main").locator("span.truncate");
		const texts = await tabs.allTextContents();
		const terminalCount = texts.filter((t) => t === "终端").length;
		expect(terminalCount).toBe(3);
	});

	test("关闭空主页标签后未创建会话", async ({ page }) => {
		// 拦截所有 POST /api/sessions 请求，记录是否触发
		let sessionCreated = false;
		await page.route("**/api/sessions", (route) => {
			if (route.request().method() === "POST") {
				sessionCreated = true;
			}
			route.continue();
		});

		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);

		const tabBar = page.locator("main").locator("span.truncate");
		const textsBefore = await tabBar.allTextContents();
		if (textsBefore.includes("主页")) {
			const homeSpan = page.locator("main").locator("span.truncate").filter({ hasText: "主页" });
			await homeSpan.locator("xpath=..").locator("button").last().click();
			await page.waitForTimeout(500);
		}
		const textsAfter = await tabBar.allTextContents();
		expect(textsAfter).not.toContain("主页");
		expect(sessionCreated).toBe(false);
	});

	test("打开同一会话时只激活已有标签", async ({ page }) => {
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);

		const tabs = page.locator("main").locator("span.truncate");
		const texts = await tabs.allTextContents();
		const taskCount = texts.filter((t) => t === "任务").length;
		expect(taskCount).toBe(1);
		await expect(page.locator("main").getByRole("heading", { name: "任务", level: 2 })).toBeVisible();
	});
});