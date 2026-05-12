import { test, expect } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:5175";
const PASSWORD = "ridge-admin";

async function login(page) {
	await page.goto(`${BASE_URL}/login`);
	await page.getByRole("textbox", { name: "密码" }).fill(PASSWORD);
	await page.getByRole("textbox", { name: "密码" }).press("Enter");
	await page.waitForURL(`${BASE_URL}/`, { timeout: 15000 });
	await page.reload();
	await page.waitForLoadState("networkidle");
	await page.getByRole("button", { name: "新建" }).first().waitFor({ state: "visible", timeout: 15000 });
	await page.waitForTimeout(3000);
}

async function openSessionByName(page, name) {
	const sessionBtn = page
		.getByRole("button")
		.filter({ hasText: name })
		.first();
	await sessionBtn.waitFor({ state: "visible", timeout: 30000 });
	await sessionBtn.click();
	await page.waitForTimeout(1000);
}

test.describe("07 会话界面与右侧工作侧栏 - 复验", () => {
	test("登录后打开已有普通会话，确认会话标签可打开，主界面有消息流、composer、复制/编辑/重试按钮", async ({ page }) => {
		await login(page);
		await openSessionByName(page, "你好");

		// 验证面包屑导航中有会话名"你好"
		const activeTab = page.locator("main").getByText("你好", { exact: false }).first();
		await expect(activeTab).toBeVisible();

		// 验证主区域有内容（消息流或提示）
		const main = page.locator("main").first();
		await expect(main).toBeVisible();

		// 验证右侧侧栏存在且包含四个 tab
		const rightPanel = main.locator("aside");
		await expect(rightPanel).toBeVisible();
		await expect(rightPanel.locator("[role='tab']").filter({ hasText: "摘要" })).toBeVisible();
		await expect(rightPanel.locator("[role='tab']").filter({ hasText: "文件" })).toBeVisible();
		await expect(rightPanel.locator("[role='tab']").filter({ hasText: "Git" })).toBeVisible();
		await expect(rightPanel.locator("[role='tab']").filter({ hasText: "Diff" })).toBeVisible();

		// 验证摘要 tab 显示真实会话信息
		const summaryPanel = rightPanel.locator("[role='tabpanel']").filter({ hasText: "会话信息" });
		await expect(summaryPanel).toBeVisible();
		await expect(summaryPanel).toContainText("标题:");
		await expect(summaryPanel).toContainText("ID:");
		await expect(summaryPanel).toContainText("状态:");
		await expect(summaryPanel).toContainText("轮次:");
		await expect(summaryPanel).toContainText("运行位置");

		// 验证 composer 存在
		const composer = page.getByRole("textbox", { name: /输入消息/ });
		await expect(composer).toBeVisible();
	});

	test("assistant 最终消息有复制按钮，user message 有编辑入口，assistant message 有重试入口", async ({ page }) => {
		await login(page);
		await openSessionByName(page, "你好");

		// 复制按钮
		const copyBtn = page.getByRole("button", { name: "复制" });
		await expect(copyBtn.first()).toBeVisible();

		// 编辑入口
		const editBtn = page.getByRole("button", { name: "编辑" });
		await expect(editBtn.first()).toBeVisible();

		// 重试入口
		const retryBtn = page.getByRole("button", { name: "重试" });
		await expect(retryBtn.first()).toBeVisible();
	});

	test("点击编辑验证分叉创建：出现新会话标签 + API POST /api/sessions 带 parentSessionId", async ({ page }) => {
		await login(page);
		await openSessionByName(page, "你好");

		// 拦截 POST /api/sessions 请求以验证 parentSessionId
		const forkPromise = page.waitForRequest(
			req => req.method() === "POST" && req.url().includes("/api/sessions"),
			{ timeout: 10000 }
		);

		// 点击编辑按钮
		await page.getByRole("button", { name: "编辑" }).first().click();

		// 等待 API 请求
		const request = await forkPromise;
		const postData = JSON.parse(request.postData() || "{}");

		// 验证 parentSessionId 存在
		expect(postData.parentSessionId).toBeTruthy();
		expect(postData.parentSessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

		// 验证新会话标签出现在侧边栏或顶部导航
		const newSessionBtn = page.getByRole("button", { name: "新会话" }).first();
		await expect(newSessionBtn).toBeVisible();
	});

	test("文件 tab 显示运行位置的文件树", async ({ page }) => {
		await login(page);
		await openSessionByName(page, "你好");

		const rightPanel = page.locator("main").first().locator("aside");
		await rightPanel.locator("[role='tab']").filter({ hasText: "文件" }).click();

		// 等待文件 tab 激活
		await rightPanel.locator("[role='tab'][aria-selected='true']").filter({ hasText: "文件" }).waitFor({ timeout: 5000 });

		// 验证文件树区域可见（通过文件列表中的具体文件名，取第一个匹配）
		const fileTree = rightPanel.locator("[role='tabpanel']").filter({ hasText: /README\.md|\.md/ }).first();
		await expect(fileTree).toBeVisible();
	});

	test("Git tab 显示 Git 能力", async ({ page }) => {
		await login(page);
		await openSessionByName(page, "你好");

		const rightPanel = page.locator("main").first().locator("aside");
		await rightPanel.locator("[role='tab']").filter({ hasText: "Git" }).click();

		// 应显示 Git 相关内容（分支名、changes 数量等）
		const gitPanel = rightPanel.locator("[role='tabpanel']").filter({ hasText: /main|Changes|Commit/ });
		await expect(gitPanel).toBeVisible();
	});

	test("Diff tab 明确显示暂不可用，不伪装 diff", async ({ page }) => {
		await login(page);
		await openSessionByName(page, "你好");

		const rightPanel = page.locator("main").first().locator("aside");
		await rightPanel.locator("[role='tab']").filter({ hasText: "Diff" }).click();

		const diffPanel = rightPanel.locator("[role='tabpanel']").filter({ hasText: /Diff.*暂不可用/ });
		await expect(diffPanel).toBeVisible();
	});

	test("控制台无阻塞性 JS 错误", async ({ page }) => {
		const errors = [];
		page.on("pageerror", (err) => errors.push(err.message));
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		await login(page);
		await openSessionByName(page, "你好");

		// 过滤 API 层面的错误
		const jsErrors = errors.filter(
			(e) =>
				!e.includes("401") &&
				!e.includes("400") &&
				!e.includes("500") &&
				!e.includes("Failed to load resource"),
		);
		expect(jsErrors).toHaveLength(0);
	});
});
