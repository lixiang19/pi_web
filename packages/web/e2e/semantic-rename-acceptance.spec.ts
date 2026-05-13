import { test, expect } from "@playwright/test";

test("语义改造：外部仓库标签与项目类型显示正确", async ({ page }) => {
	// 1. 打开登录页
	await page.goto("http://localhost:5175/login");
	await expect(page.locator('text=输入访问密码')).toBeVisible();

	// 2. 登录
	await page.fill('input[type="password"]', "ridge-admin");
	await page.press('input[type="password"]', "Enter");

	// 3. 等待主页加载，侧边栏项目列表出现
	await page.waitForSelector('text=项目', { timeout: 10000 });

	// 4. 检查外部仓库项目标签语义
	// 页面侧边栏中应显示「外部仓库」而非「外部项目」
	const externalRepoTag = page.locator('text=外部仓库').first();
	await expect(externalRepoTag).toBeVisible();

	// 5. 检查来源标签语义：应为「本地文件夹」或「GitHub」，不应出现「服务器文件夹」
	const localFolderTag = page.locator('text=本地文件夹').first();
	await expect(localFolderTag).toBeVisible();

	// 6. 不应出现旧语义「外部项目」
	await expect(page.locator('text=外部项目')).toHaveCount(0);

	// 7. 点击外部仓库项目，页面应保持稳定（URL 不变，无崩溃覆盖层）
	const repoButton = page.locator('role=button', {
		hasText: /AuroraPlatformWeb/,
	});
	if (await repoButton.isVisible().catch(() => false)) {
		await repoButton.click();
		// 页面应保持稳定（侧边栏「项目」标题仍可见）
		await expect(page.locator('text=项目').first()).toBeVisible();
	}
});

test("语义改造：非法内部项目路径被拦截（后端防线）", async ({ request }) => {
	// 先登录获取 cookie
	const loginRes = await request.post("http://localhost:5175/api/auth/login", {
		data: { password: "ridge-admin" },
	});
	expect(loginRes.status()).toBe(200);

	const cookies = loginRes.headers()["set-cookie"] || "";
	// 尝试用不存在的内部项目路径创建会话 → 400
	const res = await request.post("http://localhost:5175/api/sessions", {
		headers: { cookie: cookies },
		data: {
			cwd: "/home/user/ridge-workspace/项目/内部项目",
			title: "内部项目会话",
		},
	});
	expect(res.status()).toBe(400);
});
