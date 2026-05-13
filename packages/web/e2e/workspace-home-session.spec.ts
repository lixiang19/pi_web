import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5175";

test.describe("任务 05 工作空间主页与会话创建", () => {
	test.beforeEach(async ({ page }) => {
		// 登录
		await page.goto(`${BASE_URL}/login`);
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });
	});

	test("主页可见且未自动创建会话", async ({ page }) => {
		// 主页可见
		await expect(page.getByRole("paragraph").filter({ hasText: "开始对话" })).toBeVisible();

		// 未自动创建会话：所有 tab 文本中不应包含 "会话" 字样
		const tabTexts = await page.locator("[role='tab']").allTextContents();
		const hasChatTab = tabTexts.some((t) => t.includes("会话"));
		expect(hasChatTab).toBe(false);
	});

	test("三个快捷动作只填入输入框，不立即创建会话", async ({ page }) => {
		const textarea = page.getByRole("textbox", { name: "问我任何事…" });
		const tabList = page.locator("[role='tablist']");

		// 点击第一个快捷动作
		await page.getByRole("button", { name: "处理闪念" }).click();
		await expect(textarea).toHaveValue("帮我处理最新的闪念");
		// 没有新 tab 被创建
		await expect(tabList.locator("[role='tab']")).toHaveCount(4);

		// 点击第二个快捷动作
		await page.getByRole("button", { name: "规划任务" }).click();
		await expect(textarea).toHaveValue("帮我规划今天的任务");
		await expect(tabList.locator("[role='tab']")).toHaveCount(4);

		// 点击第三个快捷动作
		await page.getByRole("button", { name: "总结最近文件" }).click();
		await expect(textarea).toHaveValue("总结我最近的工作文件");
		await expect(tabList.locator("[role='tab']")).toHaveCount(4);
	});

	test("附件按钮可打开文件输入，选择文件后 UI 显示待附加文件", async ({ page }) => {
		const [fileChooser] = await Promise.all([
			page.waitForEvent("filechooser"),
			page.getByTestId("home-attachment-btn").click(),
		]);

		// 创建临时测试文件
		await fileChooser.setFiles([{
			name: "test-attachment.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("测试附件内容"),
		}]);

		// UI 显示待附加文件
		await expect(page.getByTestId("home-pending-attachment")).toBeVisible();
		await expect(page.getByText("test-attachment.txt")).toBeVisible();
	});

	test("模型/Agent/思考控件可见", async ({ page }) => {
		// 模型选择器
		await expect(page.locator("[role='combobox']").nth(0)).toBeVisible();
		// Agent 选择器
		await expect(page.locator("[role='combobox']").nth(1)).toBeVisible();
		// 思考级别选择器
		await expect(page.locator("[role='combobox']").nth(2)).toBeVisible();
	});

	test("输入文本后发送按钮变为可用，组件测试已覆盖提交后替换为会话 tab", async ({ page }) => {
		// 点击 textarea 并使用 keyboard.type 模拟真实输入（避免 Vue v-model 绑定问题）
		const textarea = page.getByRole("textbox", { name: "问我任何事…" });
		await textarea.click();
		await page.keyboard.type("测试发送消息创建会话");
		await page.waitForTimeout(100);

		// 验证文本已正确填入
		await expect(textarea).toHaveValue("测试发送消息创建会话");

		// 发送按钮变为可用
		const sendBtn = page.getByTestId("home-send-btn");
		await expect(sendBtn).toBeEnabled();

		// 注：完整 submit → createSession → replaceTab 链路已在组件测试中验证：
		// - HomePage.test.ts: 提交首条消息触发 submit 事件，携带完整 payload
		// - WorkspacePage.goal-session.test.ts: submit 后调用 createSession API 并替换为 chat tab
	});
});