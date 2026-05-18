import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.RIDGE_E2E_PASSWORD ?? process.env.RIDGE_ADMIN_PASSWORD ?? "ridge-admin";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5175";

/**
 * 任务16：闪念处理为正式对象 - E2E 验收测试
 *
 * 验证场景：
 * 1. 闪念列表可见处理操作按钮（日记、任务、里程碑、剪藏、删除）
 * 2. 闪念→任务处理（填写表单、确认后闪念标记已处理）
 * 3. 闪念→里程碑处理（填写表单、确认后闪念标记已处理）
 * 4. 闪念→剪藏处理（确认后闪念标记已处理）
 * 5. 闪念→附件处理（带附件闪念处理为正式附件后标记已处理）
 */
test.describe("任务16：闪念处理为正式对象", () => {
	test.beforeEach(async ({ page }) => {
		// 登录
		await page.goto(`${BASE_URL}/login`);
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });
	});

	// Helper: 在 inbox 中找到包含特定文本的闪念卡片，展开后点击指定按钮
	async function clickNoteButton(page, noteContent, buttonName) {
		const noteCard = page.locator("article").filter({ hasText: noteContent }).first();
		await noteCard.getByRole("button", { name: "展开闪念" }).click();
		await noteCard.getByRole("button", { name: buttonName }).click();
	}

	// Helper: 断言闪念仍保留，并显示已处理
	async function expectNoteHandled(page, noteContent) {
		const noteCard = page.locator("article").filter({ hasText: noteContent }).first();
		await expect(noteCard).toContainText("已处理");
	}

	test("闪念列表可见处理操作按钮", async ({ page }) => {
		// 创建测试闪念
		await page.evaluate(async () => {
			await fetch("/api/fleeting", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					content: "测试闪念 - 按钮可见性验收 " + Date.now(),
					delayAnalysis: true,
				}),
			});
		});

		// 导航到收件箱
		await page.reload();
		await page.getByRole("button", { name: /闪念/ }).first().click();

		// 验证处理按钮可见（等待 inbox 列表加载）
		await page.waitForSelector("text=/测试闪念 - 按钮可见性验收/");
		await page.locator("article").filter({ hasText: "测试闪念 - 按钮可见性验收" }).first().getByRole("button", { name: "展开闪念" }).click();
		await expect(page.getByRole("button", { name: "日记" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "任务" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "里程碑" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "剪藏" }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "删除" }).first()).toBeVisible();
	});

	test("闪念→任务处理流程（填写表单、确认后闪念标记已处理）", async ({ page }) => {
		const noteContent = "测试闪念 - 任务处理验收 " + Date.now();
		// 创建测试闪念
		await page.evaluate(async (content) => {
			await fetch("/api/fleeting", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, delayAnalysis: true }),
			});
		}, noteContent);

		// 导航到收件箱
		await page.reload();
		await page.getByRole("button", { name: /闪念/ }).first().click();

		// 等待笔记出现并点击其任务按钮
		await page.waitForSelector(`text=${noteContent}`);
		await clickNoteButton(page, noteContent, "任务");

		// 验证任务对话框打开并预填标题
		await expect(page.getByRole("dialog", { name: "创建任务" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "任务标题" })).toHaveValue(noteContent);

		// 填写验收标准
		await page.getByRole("textbox", { name: "完成标准 / 验收标准" }).fill("完成验收测试流程");

		// 提交创建任务
		await page.getByRole("button", { name: "创建任务", exact: true }).click();

		await expectNoteHandled(page, noteContent);
	});

	test("闪念→里程碑处理流程（填写表单、确认后闪念标记已处理）", async ({ page }) => {
		const noteContent = "测试闪念 - 里程碑处理验收 " + Date.now();
		await page.evaluate(async (content) => {
			await fetch("/api/fleeting", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, delayAnalysis: true }),
			});
		}, noteContent);

		await page.reload();
		await page.getByRole("button", { name: /闪念/ }).first().click();

		await page.waitForSelector(`text=${noteContent}`);
		await clickNoteButton(page, noteContent, "里程碑");

		await expect(page.getByRole("dialog", { name: "创建里程碑" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "里程碑标题" })).toHaveValue(noteContent);

		await page.getByRole("textbox", { name: "目标" }).fill("完成里程碑验收测试");
		await page.getByRole("textbox", { name: "完成标准 / 验收标准" }).fill("验证里程碑处理流程");

		await page.getByRole("button", { name: "创建里程碑", exact: true }).click();

		await expectNoteHandled(page, noteContent);
	});

	test("闪念→剪藏处理流程（确认后闪念标记已处理）", async ({ page }) => {
		const noteContent = "测试闪念 - 剪藏处理验收 " + Date.now();
		await page.evaluate(async (content) => {
			await fetch("/api/fleeting", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, delayAnalysis: true }),
			});
		}, noteContent);

		await page.reload();
		await page.getByRole("button", { name: /闪念/ }).first().click();

		await page.waitForSelector(`text=${noteContent}`);
		await clickNoteButton(page, noteContent, "剪藏");

		await expect(page.getByRole("dialog", { name: "保存为剪藏" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "标题" })).toHaveValue(noteContent);

		await page.getByRole("button", { name: "保存剪藏", exact: true }).click();

		await expectNoteHandled(page, noteContent);
	});

	test("闪念→附件处理流程（带附件闪念处理后标记已处理）", async ({ page }) => {
		const noteContent = "测试闪念 - 附件处理验收 " + Date.now();
		const noteId = await page.evaluate(async (content) => {
			const response = await fetch("/api/fleeting", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, delayAnalysis: true }),
			});
			const data = await response.json();
			return data.note.id;
		}, noteContent);

		// 通过 API 上传附件
		await page.evaluate(async ({ noteId, fileContent }) => {
			const blob = new Blob([fileContent], { type: "text/plain" });
			const formData = new FormData();
			formData.append("files", blob, "test-attachment.txt");
			await fetch(`/api/fleeting/${noteId}/attachments`, {
				method: "POST",
				body: formData,
			});
		}, { noteId, fileContent: "测试附件内容" });

		await page.reload();
		await page.getByRole("button", { name: /闪念/ }).first().click();

		// 等待笔记卡片出现在列表中
		await page.waitForSelector(`text=${noteContent}`);
		await clickNoteButton(page, noteContent, "附件");

		await expectNoteHandled(page, noteContent);
	});
});
