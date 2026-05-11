import { test, expect } from "@playwright/test";

test.describe("并行开发路线图页面验收", () => {
	test("页面可打开且标题正确", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		await page.goto("http://localhost:8765/并行开发路线图.html");
		await expect(page).toHaveTitle("05 之后并行开发路线图");

		// Wait for content to be stable
		await page.waitForSelector("h1", { state: "visible" });
	});

	test("顶部状态文字可见", async ({ page }) => {
		await page.goto("http://localhost:8765/并行开发路线图.html");
		await page.waitForSelector("h1", { state: "visible" });

		const topText = await page.locator(".container > div:first-child p").first().textContent();
		expect(topText).toContain("00–05、25 已完成");
		expect(topText).toContain("6 条并行线收敛");
	});

	test("先开工推荐批次只包含 06、08、12、17、18、30", async ({ page }) => {
		await page.goto("http://localhost:8765/并行开发路线图.html");
		await page.waitForSelector(".batch-card", { state: "visible" });

		const batchCards = page.locator(".batch-card");
		await expect(batchCards).toHaveCount(6);

		const ids = await batchCards.locator(".id").allTextContents();
		expect(ids.sort()).toEqual(["06", "08", "12", "17", "18", "30"]);
	});

	test("点击第一批筛选后泳道只显示 06/08/12/17/18/30", async ({ page }) => {
		await page.goto("http://localhost:8765/并行开发路线图.html");
		await page.waitForSelector("#laneFilters", { state: "visible" });

		await page.getByRole("button", { name: "第一批" }).click();

		// Wait for filter to apply
		await page.waitForTimeout(300);

		// Verify active class on button
		await expect(page.getByRole("button", { name: "第一批" })).toHaveClass(/active/);

		// Get all visible task cards with data-task-id (exclude base cards which don't have data-task-id)
		const taskCards = page.locator("#swimlaneBoard .task-card[data-task-id]");
		const visibleCount = await taskCards.count();
		expect(visibleCount).toBe(6);

		const visibleIds = await taskCards.evaluateAll((els) =>
			els.map((el) => el.getAttribute("data-task-id")).filter(Boolean),
		);
		expect(visibleIds.sort()).toEqual(["06", "08", "12", "17", "18", "30"]);

		// Verify 13 is NOT visible
		const card13 = page.locator('.task-card[data-task-id="13"]');
		await expect(card13).toHaveCount(0);
	});

	test("点击闪念线筛选后显示 12/13/14/15/16 并可见 13 与 14 关系", async ({ page }) => {
		await page.goto("http://localhost:8765/并行开发路线图.html");
		await page.waitForSelector("#laneFilters", { state: "visible" });

		await page.getByRole("button", { name: "闪念线" }).click();
		await page.waitForTimeout(300);

		// Verify active class
		await expect(page.getByRole("button", { name: "闪念线" })).toHaveClass(/active/);

		// In 闪念线 lane (C), there should be base + 12 + 13 + 14 + 15 + 16 = 6 cards
		const fleetingLane = page.locator("#swimlaneBoard .swimlane").nth(2); // C lane
		const fleetingCards = fleetingLane.locator(".task-card");
		await expect(fleetingCards).toHaveCount(6);

		// Verify 12-16 are present
		for (const id of ["12", "13", "14", "15", "16"]) {
			await expect(fleetingLane.locator(`.task-card[data-task-id="${id}"]`)).toHaveCount(1);
		}

		// Verify "13 与 14 的关系" section is visible
		const relationSection = page.locator("text=13 与 14 的关系");
		await expect(relationSection).toBeVisible();
	});

	test("点击 13 和 14 任务节点，详情面板显示对应说明", async ({ page }) => {
		await page.goto("http://localhost:8765/并行开发路线图.html");
		await page.waitForSelector("#laneFilters", { state: "visible" });

		await page.getByRole("button", { name: "闪念线" }).click();
		await page.waitForTimeout(300);

		// Click 13
		await page.locator('.task-card[data-task-id="13"]').click();
		await page.waitForTimeout(300);

		const detailTitle13 = await page.locator("#detailTitle").textContent();
		expect(detailTitle13).toContain("13");
		expect(detailTitle13).toContain("闪念临时附件生命周期");

		const detailDesc13 = await page.locator("#detailDesc").textContent();
		expect(detailDesc13).toContain(".ridge/fleeting-attachments");
		expect(detailDesc13).toContain("不进 RAG");
		expect(detailDesc13).toContain("不进文件树");
		expect(detailDesc13).toContain("不给 MCP");

		// Click 14
		await page.locator('.task-card[data-task-id="14"]').click();
		await page.waitForTimeout(300);

		const detailTitle14 = await page.locator("#detailTitle").textContent();
		expect(detailTitle14).toContain("14");
		expect(detailTitle14).toContain("桌面采集入口");

		const detailDesc14 = await page.locator("#detailDesc").textContent();
		expect(detailDesc14).toContain("菜单栏");
		expect(detailDesc14).toContain("截图");
		expect(detailDesc14).toContain("文件");
		expect(detailDesc14).toContain("剪贴板");
		expect(detailDesc14).toContain("浏览器网址");
		expect(detailDesc14).toContain("录音");
		expect(detailDesc14).toContain("上传到服务器变成闪念");
	});

	test("页面 DOM 不包含 scrollIntoView", async ({ page }) => {
		await page.goto("http://localhost:8765/并行开发路线图.html");
		await page.waitForLoadState("networkidle");

		const html = await page.evaluate(() => document.documentElement.outerHTML);
		expect(html).not.toContain("scrollIntoView");
	});
});
