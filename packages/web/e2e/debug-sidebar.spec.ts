import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = "ridge-admin";
const BASE_URL = "http://[::1]:5175";

test.describe("DEBUG: sidebar DOM inspection", () => {
	test("inspect DOM after opening session", async ({ page }) => {
		// 1. 登录
		await page.goto(`${BASE_URL}/login`);
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL(`${BASE_URL}/`, { timeout: 5000 });

		// 2. 创建会话
		const workspaceDir = path.join(os.homedir(), "ridge-workspace");
		const sessionRes = await page.request.post(`${BASE_URL}/api/sessions`, {
			data: {
				cwd: workspaceDir,
				title: "调试会话",
			},
		});
		const sessionData = await sessionRes.json().catch(() => ({}));
		expect(sessionData.id).toBeDefined();

		// 3. 刷新并点击会话
		await page.reload();
		await page.waitForTimeout(1000);

		const sessionButton = page.getByRole("button", { name: "调试会话", exact: true }).first();
		await sessionButton.waitFor({ state: "visible", timeout: 5000 });
		await sessionButton.click();

		// 等待聊天主区出现
		await expect(page.getByRole("heading", { name: "暂无消息" })).toBeVisible({ timeout: 5000 });
		await page.waitForTimeout(3000);

		// 4. 检查 Vue 组件树
		const vueInfo = await page.evaluate(() => {
			const heading = document.querySelector('h3');
			if (!heading) return { noHeading: true };
			
			// @ts-ignore
			const vueComponent = heading.__vueParentComponent;
			if (!vueComponent) return { noVueComponent: true };
			
			let current = vueComponent;
			const ancestors = [];
			while (current) {
				ancestors.push(current.type?.name || current.type?.__name || 'unknown');
				current = current.parent;
			}
			
			return { ancestors };
		});
		console.log("=== VUE ANCESTORS ===");
		console.log(JSON.stringify(vueInfo, null, 2));

		// 6. 检查是否有侧边栏切换按钮（PanelRightClose/PanelRightOpen图标）
		const hasPanelRight = await page.evaluate(() => {
			const html = document.body.innerHTML;
			return {
				hasPanelRightClose: html.includes('PanelRightClose'),
				hasPanelRightOpen: html.includes('PanelRightOpen'),
				panelRightCount: (html.match(/PanelRight/g) || []).length,
			};
		});
		console.log("=== PANEL RIGHT ICONS ===");
		console.log(JSON.stringify(hasPanelRight, null, 2));

		// 7. 检查 HTML 中是否包含 sidebar 相关类名
		const htmlChecks = await page.evaluate(() => {
			const html = document.body.innerHTML;
			return {
				hasW64: html.includes('w-64'),
				hasShrink0: html.includes('shrink-0'),
				hasBorderL: html.includes('border-l'),
				hasSidebarTab: html.includes('data-test="sidebar-tab"'),
				hasSummary: html.includes('摘要'),
				hasFileTree: html.includes('文件树'),
				hasGit: html.includes('Git'),
				hasDiff: html.includes('Diff'),
				buttonCount: document.querySelectorAll('button').length,
			};
		});
		console.log("=== HTML CHECKS ===");
		console.log(JSON.stringify(htmlChecks, null, 2));

		// 6. 查找所有带有 title 属性的按钮
		const buttonsWithTitle = await page.evaluate(() => {
			return Array.from(document.querySelectorAll('button[title]')).map(b => ({
				title: b.getAttribute('title'),
				text: b.textContent?.trim(),
			}));
		});
		console.log("=== BUTTONS WITH TITLE ===");
		console.log(JSON.stringify(buttonsWithTitle, null, 2));
	});
});
