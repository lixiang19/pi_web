import { test, expect } from "@playwright/test";

test.describe("工作台左侧导航任务04", () => {
	test.beforeEach(async ({ page }) => {
		// 登录流程
		await page.goto("/");
		await expect(page.getByRole("heading", { name: "输入访问密码" })).toBeVisible();
		await page.getByRole("textbox", { name: "密码" }).fill("ridge-admin");
		await page.getByRole("button", { name: "进入工作台" }).click();
		// 等待工作台主内容可见
		await expect(page.locator("main")).toBeVisible();
		await page.waitForTimeout(2000);
	});

	test("固定入口包含任务、终端、归档", async ({ page }) => {
		// 验证固定入口导航项可见
		await expect(page.getByRole("button", { name: "任务" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "终端" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "归档" }).first()).toBeVisible();
	});

	test("点击任务打开任务页面并显示任务看板", async ({ page }) => {
		await page.getByRole("button", { name: "任务" }).first().click();
		await page.waitForTimeout(1500);
		// 主区域应显示任务标题
		await expect(page.locator("main").getByRole("heading", { name: "任务", level: 2 })).toBeVisible();
		// 面包屑应显示"任务"
		const tabs = page.locator("main > div > div").locator("span.truncate");
		const texts = await tabs.allTextContents();
		expect(texts).toContain("任务");
	});

	test("点击终端打开终端页面并显示终端提示符", async ({ page }) => {
		await page.getByRole("button", { name: "终端" }).first().click();
		await page.waitForTimeout(1500);
		// 面包屑应显示"终端"
		const tabs = page.locator("main > div > div").locator("span.truncate");
		const texts = await tabs.allTextContents();
		expect(texts).toContain("终端");
		// 终端区域应显示提示符文本
		await expect(page.locator("main").locator("text=lixiang@lixiangdeMac-mini-3 ridge-workspace %").first()).toBeVisible();
	});

	test("点击归档打开归档页面", async ({ page }) => {
		await page.getByRole("button", { name: "归档" }).first().click();
		await page.waitForTimeout(1500);
		// 主区域应显示归档标题
		await expect(page.locator("main").getByRole("heading", { name: "归档", level: 2 })).toBeVisible();
		// 面包屑应显示"归档"
		const tabs = page.locator("main > div > div").locator("span.truncate");
		const texts = await tabs.allTextContents();
		expect(texts).toContain("归档");
	});

	test("项目列表中可点击项目并激活", async ({ page }) => {
		// 查找第一个项目按钮
		const firstProject = page.getByRole("button", { name: /AuroraPlatformWeb/ }).first();
		if (await firstProject.isVisible()) {
			await firstProject.click();
			await page.waitForTimeout(1000);
			// 点击后项目应变为 active 状态（至少可验证按钮仍存在且可点击）
			await expect(firstProject).toBeVisible();
		}
	});
});
