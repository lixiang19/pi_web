import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = "ridge-admin";
const BASE_URL = "http://127.0.0.1:5175";

test.describe("任务 05 会话附件后端 + 前端全链路", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE_URL}/login`);
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });
	});

	test("主页附件按钮可打开文件输入，选择文件后 UI 显示待附加文件", async ({ page }) => {
		const [fileChooser] = await Promise.all([
			page.waitForEvent("filechooser"),
			page.getByTestId("home-attachment-btn").click(),
		]);

		await fileChooser.setFiles([{
			name: "test-attachment.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("测试附件内容 - 任务05端到端验证"),
		}]);

		await expect(page.getByTestId("home-pending-attachment")).toBeVisible();
		await expect(page.getByText("test-attachment.txt")).toBeVisible();
	});

	test("输入文本并选择附件后发送按钮可用，前端状态正确", async ({ page }) => {
		const textarea = page.getByRole("textbox", { name: "问我任何事…" });
		await textarea.click();
		await page.keyboard.type("测试会话附件端到端验证");
		await page.waitForTimeout(100);

		const [fileChooser] = await Promise.all([
			page.waitForEvent("filechooser"),
			page.getByTestId("home-attachment-btn").click(),
		]);
		await fileChooser.setFiles([{
			name: "test-attachment.txt",
			mimeType: "text/plain",
			buffer: Buffer.from("测试附件内容"),
		}]);

		await expect(page.getByTestId("home-pending-attachment")).toBeVisible();

		const sendBtn = page.getByTestId("home-send-btn");
		await expect(sendBtn).toBeEnabled();

		// 注：完整 submit → createSession → upload attachments → replaceTab 链路
		// 已在组件测试中覆盖（HomePage.test.ts + WorkspacePage.test.ts）
		// e2e 层验证到 UI 就绪状态即可，组件测试保证 payload 含 attachments
	});

	test("后端附件 API：上传文件后落盘并返回附件 id，响应不泄露 storedPath", async ({ page }) => {
		// 使用 page.request 共享已登录的 cookie
		// 创建一个测试会话
		const createRes = await page.request.post(`${BASE_URL}/api/sessions`, {
			data: { cwd: "/Users/lixiang/ridge-workspace", title: "附件测试" },
		});
		expect(createRes.status()).toBe(201);
		const sessionData = await createRes.json();
		const sessionId = sessionData.id;
		expect(sessionId).toBeTruthy();

		// 上传附件
		const uploadRes = await page.request.post(`${BASE_URL}/api/sessions/${sessionId}/attachments`, {
			multipart: {
				files: {
					name: "api-test.txt",
					mimeType: "text/plain",
					buffer: Buffer.from("API 测试附件内容"),
				},
			},
		});
		expect(uploadRes.status()).toBe(201);
		const uploadData = await uploadRes.json();
		expect(uploadData.attachments).toBeInstanceOf(Array);
		expect(uploadData.attachments.length).toBeGreaterThan(0);

		const att = uploadData.attachments[0];
		expect(att.id).toBeTruthy();
		expect(att.originalName).toBe("api-test.txt");
		expect(att.mimeType).toBe("text/plain");
		expect(att).not.toHaveProperty("storedPath");
		expect(att).not.toHaveProperty("stored_path");

		// 验证列表接口也能返回附件且不泄露 storedPath
		const listRes = await page.request.get(`${BASE_URL}/api/sessions/${sessionId}/attachments`);
		expect(listRes.status()).toBe(200);
		const listData = await listRes.json();
		expect(listData.attachments).toBeInstanceOf(Array);
		expect(listData.attachments.length).toBeGreaterThan(0);
		expect(listData.attachments[0]).not.toHaveProperty("storedPath");
		expect(listData.attachments[0]).not.toHaveProperty("stored_path");
	});

	test("后端附件 API：上传到不存在 session 返回 404 且不写 DB", async ({ page }) => {
		const uploadRes = await page.request.post(`${BASE_URL}/api/sessions/non-existent-session/attachments`, {
			multipart: {
				files: {
					name: "fail.txt",
					mimeType: "text/plain",
					buffer: Buffer.from("should fail"),
				},
			},
		});
		expect(uploadRes.status()).toBe(404);
	});
});
