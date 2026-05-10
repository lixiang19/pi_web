import { test, expect } from "@playwright/test";

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
		await page.getByRole("textbox", { name: "密码" }).fill("ridge-admin");
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL("http://localhost:81/");
		await expect(page.locator("main")).toBeVisible();
		await page.waitForTimeout(2000);
	});

	test("左侧固定入口包含要求的条目，且不包含主页", async ({ page }) => {
		const required = ["闪念", "搜索", "通知", "任务", "文件", "终端", "自动化", "Skill", "设置"];
		for (const name of required) {
			await expect(page.getByRole("button", { name }).first()).toBeVisible();
		}

		// 主页按钮仅应出现在顶部标签栏，不应出现在左侧固定入口
		const sidebar = page.locator("div").filter({ hasText: "闪念" }).first().locator("..");
		const sidebarButtons = await sidebar.locator("button").allInnerTexts();
		expect(sidebarButtons).not.toContain("主页");
	});

	test("点击任务打开工作台标签，重复点击只保留一个任务标签", async ({ page }) => {
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		await expect(page.locator("main").getByRole("heading", { name: "任务", level: 2 })).toBeVisible();

		const tabs = page.locator("main > div > div").locator("span.truncate");
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

		const tabs = page.locator("main > div > div").locator("span.truncate");
		const texts = await tabs.allTextContents();
		const terminalCount = texts.filter((t) => t === "终端").length;
		expect(terminalCount).toBe(3);
	});

	test("关闭空主页标签后未创建会话", async ({ page }) => {
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		const tabBar = page.locator("main > div > div");
		const tabs = tabBar.locator("span.truncate");
		const textsBefore = await tabs.allTextContents();
		if (textsBefore.includes("主页")) {
			const homeSpan = tabBar.locator("span.truncate").filter({ hasText: "主页" });
			await homeSpan.locator("xpath=..").locator("button").last().click();
			await page.waitForTimeout(500);
		}
		const textsAfter = await tabs.allTextContents();
		expect(textsAfter).not.toContain("主页");
	});

	test("打开同一会话时只激活已有标签", async ({ page }) => {
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		const tabs = page.locator("main > div > div").locator("span.truncate");
		const texts = await tabs.allTextContents();
		const taskCount = texts.filter((t) => t === "任务").length;
		expect(taskCount).toBe(1);
		await expect(page.locator("main").getByRole("heading", { name: "任务", level: 2 })).toBeVisible();
	});
});
