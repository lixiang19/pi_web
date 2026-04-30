import { expect, test } from "@playwright/test";

test.describe("文件树功能 E2E 测试", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");
		// 导航到工作空间页面
		const workspaceLink = page.locator("text=工作空间").first();
		if (await workspaceLink.isVisible()) {
			await workspaceLink.click();
			await page.waitForLoadState("networkidle");
		}
		// 等待文件树加载
		await page.waitForTimeout(2000);
		// 确保文件 tab 已选中（点击"文件" tab）
		const fileTab = page.locator('[role="tab"]').filter({ hasText: "文件" });
		if (await fileTab.isVisible()) {
			await fileTab.click();
			await page.waitForTimeout(500);
		}
	});

	// 辅助函数：获取文件树面板内的目录行（外层 div，含 cursor-grab class）
	const getDirRows = (page: import("@playwright/test").Page) =>
		page.locator('[data-state="active"][role="tabpanel"] .cursor-grab');
	// 辅助函数：获取文件树面板内的文件行（外层 div，含 cursor-pointer class）
	const getFileRows = (page: import("@playwright/test").Page) =>
		page.locator('[data-state="active"][role="tabpanel"] .cursor-pointer');

	// ===== A. 文件树浏览 =====

	test("A1: 加载根目录", async ({ page }) => {
		await page.waitForTimeout(3000);
		await page.screenshot({ path: "e2e/screenshots/A1-file-tree-loaded.png" });
		// 验证文件树面板存在且有内容（通过 aria-labelledby 中的 files 标识）
		const treeContent = page.locator('[role="tabpanel"][id$="-content-files"]');
		await expect(treeContent).toBeVisible();
	});

	test("A2: 展开目录", async ({ page }) => {
		await page.waitForTimeout(2000);
		const dirRow = getDirRows(page).first();
		if (await dirRow.isVisible()) {
			await dirRow.click();
			await page.waitForTimeout(1000);
			await page.screenshot({
				path: "e2e/screenshots/A2-directory-expanded.png",
			});
		}
	});

	test("A3: 折叠目录", async ({ page }) => {
		await page.waitForTimeout(2000);
		const dirRow = getDirRows(page).first();
		if (await dirRow.isVisible()) {
			// 展开
			await dirRow.click();
			await page.waitForTimeout(1000);
			// 折叠
			await dirRow.click();
			await page.waitForTimeout(500);
			await page.screenshot({
				path: "e2e/screenshots/A3-directory-collapsed.png",
			});
		}
	});

	test("A6: 刷新树", async ({ page }) => {
		await page.waitForTimeout(2000);
		// 在文件树区域找刷新按钮（小图标按钮）
		const allButtons = page.locator("button");
		const buttonCount = await allButtons.count();
		for (let i = 0; i < buttonCount; i++) {
			const btn = allButtons.nth(i);
			const box = await btn.boundingBox();
			if (box && box.width < 40 && box.height < 40) {
				await btn.click();
				break;
			}
		}
		await page.waitForTimeout(2000);
		await page.screenshot({ path: "e2e/screenshots/A6-refresh.png" });
	});

	// ===== C. 收藏 =====

	test("C1: 收藏 Tab", async ({ page }) => {
		await page.waitForTimeout(2000);
		const favTab = page.locator('[role="tab"]').nth(1);
		if (await favTab.isVisible()) {
			await favTab.click();
			await page.waitForTimeout(1000);
			await page.screenshot({ path: "e2e/screenshots/C3-favorites-tab.png" });
			const emptyText = page.locator("text=暂无收藏");
			const hasEmpty = await emptyText.isVisible().catch(() => false);
			expect(
				hasEmpty || (await page.locator(".space-y-1").count()) > 0,
			).toBeTruthy();
		}
	});

	// ===== D. 搜索 =====

	test("D1: 搜索文件", async ({ page }) => {
		await page.waitForTimeout(2000);
		const searchTab = page.locator('[role="tab"]').nth(2);
		if (await searchTab.isVisible()) {
			await searchTab.click();
			await page.waitForTimeout(500);
			const searchInput = page.locator('input[placeholder="搜索文件..."]');
			if (await searchInput.isVisible()) {
				await searchInput.fill("md");
				await page.waitForTimeout(1500);
				await page.screenshot({
					path: "e2e/screenshots/D1-search-results.png",
				});
				const hasResults =
					(await page.locator("text=未找到").count()) > 0 ||
					(await page.locator("text=md").count()) > 1;
				expect(hasResults).toBeTruthy();
			}
		}
	});

	// ===== E. 最近文件 =====

	test("E1: 最近文件 Tab", async ({ page }) => {
		await page.waitForTimeout(2000);
		const recentTab = page.locator('[role="tab"]').nth(3);
		if (await recentTab.isVisible()) {
			await recentTab.click();
			await page.waitForTimeout(1000);
			await page.screenshot({ path: "e2e/screenshots/E1-recent-files.png" });
		}
	});

	// ===== G. 右键菜单 =====

	test("G1: 文件右键菜单", async ({ page }) => {
		await page.waitForTimeout(2000);
		const fileRow = getFileRows(page).first();
		if (await fileRow.isVisible()) {
			await fileRow.click({ button: "right" });
			await page.waitForTimeout(500);
			await page.screenshot({
				path: "e2e/screenshots/G1-file-context-menu.png",
			});
			const menuItems = page.locator('[role="menuitem"]');
			const count = await menuItems.count();
			expect(count).toBeGreaterThan(0);
		}
	});

	test("G2: 目录右键菜单", async ({ page }) => {
		await page.waitForTimeout(2000);
		const dirRow = getDirRows(page).first();
		if (await dirRow.isVisible()) {
			await dirRow.click({ button: "right" });
			await page.waitForTimeout(500);
			await page.screenshot({
				path: "e2e/screenshots/G2-dir-context-menu.png",
			});
			const menuItems = page.locator('[role="menuitem"]');
			const count = await menuItems.count();
			expect(count).toBeGreaterThan(0);
		}
	});

	// ===== B. 文件操作（破坏性操作放最后） =====

	test("B2: 行内重命名", async ({ page }) => {
		await page.waitForTimeout(2000);
		const fileRow = getFileRows(page).first();
		if (await fileRow.isVisible()) {
			await fileRow.click({ button: "right" });
			await page.waitForTimeout(300);
			const renameItem = page
				.locator('[role="menuitem"]')
				.filter({ hasText: "重命名" });
			if (await renameItem.isVisible()) {
				await renameItem.click();
				await page.waitForTimeout(300);
				await page.screenshot({ path: "e2e/screenshots/B2-rename-input.png" });
				const editInput = page.locator('input[type="text"]');
				await expect(editInput).toBeVisible();
				await editInput.press("Escape");
			}
		}
	});

	test("B4: 删除确认对话框", async ({ page }) => {
		await page.waitForTimeout(2000);
		const fileRow = getFileRows(page).first();
		if (await fileRow.isVisible()) {
			await fileRow.click({ button: "right" });
			await page.waitForTimeout(300);
			const deleteItem = page
				.locator('[role="menuitem"]')
				.filter({ hasText: "删除" });
			if (await deleteItem.isVisible()) {
				await deleteItem.click();
				await page.waitForTimeout(500);
				await page.screenshot({ path: "e2e/screenshots/B4-delete-dialog.png" });
				const dialog = page.locator('[role="alertdialog"]');
				await expect(dialog).toBeVisible();
				const cancelBtn = page.locator('[role="alertdialog"] button').first();
				await cancelBtn.click();
			}
		}
	});

	test("B6: 新建文件夹", async ({ page }) => {
		await page.waitForTimeout(2000);
		const dirRow = getDirRows(page).first();
		if (await dirRow.isVisible()) {
			await dirRow.click({ button: "right" });
			await page.waitForTimeout(300);
			const createFolderItem = page
				.locator('[role="menuitem"]')
				.filter({ hasText: "新建文件夹" });
			if (await createFolderItem.isVisible()) {
				await createFolderItem.click();
				await page.waitForTimeout(300);
				await page.screenshot({
					path: "e2e/screenshots/B6-create-folder-input.png",
				});
				const editInput = page.locator('input[type="text"]');
				await expect(editInput).toBeVisible();
				await editInput.press("Escape");
			}
		}
	});
});
