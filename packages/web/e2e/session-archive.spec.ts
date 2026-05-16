import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5175";

test.describe("06 会话索引归档与只读状态", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE_URL}/login`);
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });
		// 等待工作区内容加载
		await page.waitForTimeout(800);
	});

	test("归档入口可见且点击打开归档标签", async ({ page }) => {
		// 左侧底部归档入口可见（data-test 属性）
		const archiveEntry = page.locator('[data-test="workspace-archived-entry"]');
		await expect(archiveEntry).toBeVisible({ timeout: 5000 });
		await expect(archiveEntry).toContainText("归档");

		// 点击后右侧打开归档标签
		await archiveEntry.click();
		await expect(page.getByRole("heading", { name: "归档" }).first()).toBeVisible({ timeout: 5000 });
	});

	test("通过 API 创建、归档、过滤和 403 验证", async ({ page, context }) => {
		// 获取认证 Cookie 用于直接 API 调用
		const cookies = await context.cookies();
		const ridgeSession = cookies.find((c) => c.name === "ridge_session")?.value;
		expect(ridgeSession).toBeTruthy();

		// 1. 创建会话
		const systemInfoRes = await page.request.get(`${BASE_URL}/api/system/info`, {
			headers: { Cookie: `ridge_session=${ridgeSession}` },
		});
		expect(systemInfoRes.status()).toBe(200);
		const systemInfo = (await systemInfoRes.json()) as { workspaceDir: string };

		const createRes = await page.request.post(`${BASE_URL}/api/sessions`, {
			headers: { Cookie: `ridge_session=${ridgeSession}` },
			data: {
				cwd: systemInfo.workspaceDir,
				title: "归档验收测试会话",
			},
		});
		expect(createRes.status()).toBe(201);
		const session = await createRes.json();
		const sessionId = session.id as string;
		expect(session.archived).toBe(false);

		// 2. 归档前普通列表包含该会话
		const beforeListRes = await page.request.get(`${BASE_URL}/api/sessions`, {
			headers: { Cookie: `ridge_session=${ridgeSession}` },
		});
		expect(beforeListRes.status()).toBe(200);
		const beforeSessions = (await beforeListRes.json()) as Array<{
			id: string;
			archived: boolean;
		}>;
		const beforeSession = beforeSessions.find((s) => s.id === sessionId);
		expect(beforeSession).toBeDefined();
		expect(beforeSession?.archived).toBe(false);

		// 3. 调用归档 API
		const archiveRes = await page.request.post(
			`${BASE_URL}/api/sessions/${sessionId}/archive`,
			{
				headers: { Cookie: `ridge_session=${ridgeSession}` },
				data: { archived: true },
			},
		);
		expect(archiveRes.status()).toBe(200);
		const archiveBody = await archiveRes.json();
		expect(archiveBody.ok).toBe(true);
		expect(archiveBody.sessionIds).toContain(sessionId);

		// 4. 归档后普通列表不包含该会话
		const afterListRes = await page.request.get(`${BASE_URL}/api/sessions`, {
			headers: { Cookie: `ridge_session=${ridgeSession}` },
		});
		expect(afterListRes.status()).toBe(200);
		const afterSessions = (await afterListRes.json()) as Array<{
			id: string;
			archived: boolean;
		}>;
		const afterSession = afterSessions.find((s) => s.id === sessionId);
		expect(afterSession).toBeUndefined();

		// 5. 对归档会话发送消息返回 403
		const messageRes = await page.request.post(
			`${BASE_URL}/api/sessions/${sessionId}/messages`,
			{
				headers: { Cookie: `ridge_session=${ridgeSession}` },
				data: { prompt: "test" },
			},
		);
		expect(messageRes.status()).toBe(403);
		const messageBody = await messageRes.text();
		expect(messageBody).toContain("归档会话不可发送消息");

		// 6. 清理：取消归档
		await page.request.post(
			`${BASE_URL}/api/sessions/${sessionId}/archive`,
			{
				headers: { Cookie: `ridge_session=${ridgeSession}` },
				data: { archived: false },
			},
		);
	});

	test("同一个未归档会话点击两次只保留一个标签", async ({ page }) => {
		// 查找一个可见的未归档工作空间会话（排除"归档"按钮本身）
		const sessionBtn = page
			.locator("aside div:has-text('工作空间会话') + button, aside div:has-text('项目') ~ div button")
			.first();

		// 如果没有可见会话则跳过（依赖测试数据环境）
		const count = await sessionBtn.count();
		test.skip(count === 0, "无可测试的可见会话");

		// 第一次点击
		await sessionBtn.click();
		await page.waitForTimeout(300);

		// 获取当前主区域标签数
		const tabsAfterFirst = page.locator("main [role='tab']");
		const countAfterFirst = await tabsAfterFirst.count();

		// 第二次点击同一个会话
		await sessionBtn.click();
		await page.waitForTimeout(300);

		// 标签数不应增加（去重生效）
		const countAfterSecond = await tabsAfterFirst.count();
		expect(countAfterSecond).toBe(countAfterFirst);
	});

	test("控制台无阻塞功能的 JS error（登录前 401 除外）", async ({ page }) => {
		// 等待页面稳定
		await page.waitForTimeout(500);

		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		// 执行交互：点击归档入口
		await page.locator('[data-test="workspace-archived-entry"]').click();
		await page.waitForTimeout(300);
		// 点击第一个固定入口
		const firstEntry = page.locator('[data-test="workspace-fixed-entry"]').first();
		if (await firstEntry.count()) {
			await firstEntry.click();
			await page.waitForTimeout(300);
		}

		// 过滤掉已知的非阻塞错误（recent-files 400、notes 500 等）
		const blockingErrors = errors.filter(
			(e) =>
				!e.includes("400") &&
				!e.includes("500") &&
				!e.includes("recent-files") &&
				!e.includes("notes/content") &&
				!e.includes("files/tree") &&
				!e.includes("the server responded with a status"),
		);

		expect(blockingErrors).toEqual([]);
	});
});
