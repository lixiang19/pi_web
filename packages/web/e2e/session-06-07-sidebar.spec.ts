import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = "ridge-admin";

const buildContextId = (projectRoot: string, worktreeRoot: string) =>
	crypto
		.createHash("sha1")
		.update(`${path.resolve(projectRoot)}::${path.resolve(worktreeRoot)}`)
		.digest("hex");

function getBetterSqlite3() {
	const serverPackageJson = path.resolve(
		import.meta.dirname,
		"../../server/package.json",
	);
	const req = createRequire(serverPackageJson);
	const dbPath = req.resolve("better-sqlite3");
	return req(dbPath) as typeof import("better-sqlite3");
}

test.describe("任务 06-07 会话索引归档与只读状态 + 右侧工作侧栏", () => {
	test("完整验收路径：登录 -> 预置会话 -> 打开会话 -> 验证侧栏四个 tab -> 折叠展开侧栏", async ({ page }) => {
		const timestamp = Date.now();
		const testProjectDir = path.join(os.homedir(), `ridge-e2e-06-07-${timestamp}`);
		const sessionFilePath = path.join(testProjectDir, "session-empty.jsonl");

		// 1. 在 Node 进程内准备测试项目目录和空 session 文件
		fs.mkdirSync(testProjectDir, { recursive: true });
		fs.writeFileSync(sessionFilePath, "", "utf8");

		// 2. 计算 context_id（与服务端 buildContextId 一致）
		const contextId = buildContextId(testProjectDir, testProjectDir);
		const sessionId = `e2e-06-07-${timestamp}`;
		const now = Date.now();
		const posixCwd = testProjectDir.split(path.sep).join("/");
		const posixSessionFile = sessionFilePath.split(path.sep).join("/");

		// 3. 直接用 better-sqlite3 写入 ridge.db
		const dbPath = path.join(os.homedir(), ".pi", "ridge.db");
		const Database = getBetterSqlite3();
		const db = new Database(dbPath);

		db.prepare(
			`INSERT INTO sessions(
        session_id, title, cwd, session_file, created_at, updated_at,
        archived, readonly, context_id, user_round_count
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        title = excluded.title,
        cwd = excluded.cwd,
        session_file = excluded.session_file,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        archived = excluded.archived,
        readonly = excluded.readonly,
        context_id = excluded.context_id,
        user_round_count = excluded.user_round_count`,
		).run(
			sessionId,
			"验收会话06-07",
			posixCwd,
			posixSessionFile,
			now,
			now,
			0,
			0,
			contextId,
			0,
		);

		db.prepare(
			`INSERT INTO session_index(
        session_id, title, session_type, context_type, workspace_path,
        project_id, run_location, archived, readonly, created_at, updated_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        title = excluded.title,
        session_type = excluded.session_type,
        context_type = excluded.context_type,
        workspace_path = excluded.workspace_path,
        project_id = excluded.project_id,
        run_location = excluded.run_location,
        archived = excluded.archived,
        readonly = excluded.readonly,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at`,
		).run(
			sessionId,
			"验收会话06-07",
			"workspace",
			"workspace",
			posixCwd,
			"ridge:workspace-chat",
			"server",
			0,
			0,
			now,
			now,
		);

		db.prepare(
			`INSERT INTO session_contexts(
        context_id, project_id, project_root, project_label,
        worktree_root, worktree_label, is_git, cwd
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(context_id) DO UPDATE SET
        project_id = excluded.project_id,
        project_root = excluded.project_root,
        project_label = excluded.project_label,
        worktree_root = excluded.worktree_root,
        worktree_label = excluded.worktree_label,
        is_git = excluded.is_git,
        cwd = excluded.cwd`,
		).run(
			contextId,
			"ridge:workspace-chat",
			posixCwd,
			"ridge-workspace",
			posixCwd,
			"ridge-workspace",
			0,
			posixCwd,
		);

		db.close();

		// 4. 登录（使用相对路径，走 Playwright baseURL）
		await page.goto("/login");
		await page.getByRole("textbox", { name: "密码" }).fill(ADMIN_PASSWORD);
		await page.getByRole("textbox", { name: "密码" }).press("Enter");
		await page.waitForURL("/", { timeout: 5000 });

		// 验证主页关键元素
		await expect(page.getByText("开始对话")).toBeVisible();
		await expect(page.getByRole("textbox", { name: "问我任何事…" })).toBeVisible();

		// 5. 刷新页面让会话列表出现
		await page.reload();
		await page.waitForTimeout(1000);

		// 6. 点击预置会话打开聊天界面
		const sessionButton = page
			.getByRole("button", { name: "验收会话06-07", exact: true })
			.first();
		await sessionButton.waitFor({ state: "visible", timeout: 5000 });
		await sessionButton.click();

		// 等待聊天主区出现
		await expect(page.getByRole("heading", { name: "暂无消息" })).toBeVisible({ timeout: 5000 });
		await expect(page.getByRole("textbox", { name: /输入消息/ })).toBeVisible();

		// 侧栏在会话上下文加载完成后才渲染，给足时间
		await page.waitForTimeout(3000);

		// 7. 验证右侧工作侧栏四个 tab 均可见
		await expect(page.getByRole("button", { name: "摘要" })).toBeVisible();
		await expect(page.getByRole("button", { name: "文件树" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Git", exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Diff" })).toBeVisible();

		// 默认摘要 tab 激活（显示会话信息）
		await expect(page.getByText("会话").nth(0)).toBeVisible();
		await expect(
			page.locator("div.font-medium").filter({ hasText: "验收会话06-07" }).first(),
		).toBeVisible();

		// 8. 切换到文件树 tab — 因为准备了 context，应显示真实 FileTreePanel
		await page.getByRole("button", { name: "文件树" }).click();
		await page.waitForTimeout(1500);
		// FileTreePanel 应渲染（而不是显示"无法确定文件树根目录"）
		await expect(page.getByText("无法确定文件树根目录")).not.toBeVisible();
		// 只要侧栏容器和 FileTreePanel 内部结构出现即可
		await expect(page.locator("div.flex-col.border-l").first()).toBeVisible();

		// 9. 切换到 Git tab
		await page.getByRole("button", { name: "Git", exact: true }).click();
		await expect(
			page.locator("div.p-3").filter({ hasText: /Git 不可用/ }),
		).toBeVisible();

		// 10. 切换到 Diff tab
		await page.getByRole("button", { name: "Diff" }).click();
		await expect(page.getByText("使用工作空间隐藏版本管理 Diff（占位）")).toBeVisible();

		// 11. 验证侧栏折叠/展开
		const hideButton = page.getByRole("button", { name: "隐藏侧栏" });
		await expect(hideButton).toBeVisible();
		await hideButton.click();
		await expect(page.getByRole("button", { name: "显示侧栏" })).toBeVisible();
		await page.getByRole("button", { name: "显示侧栏" }).click();
		await expect(hideButton).toBeVisible();

		// 12. 验证摘要信息
		await expect(page.locator("div.p-3").filter({ hasText: "项目类型" }).first()).toBeVisible();
		await expect(page.locator("div.p-3").filter({ hasText: "外部项目" }).first()).toBeVisible();
		await expect(page.locator("div.p-3").filter({ hasText: "状态" }).first()).toBeVisible();
		await expect(page.locator("div.p-3").filter({ hasText: "在线" }).first()).toBeVisible();
		await expect(page.locator("div.p-3").filter({ hasText: "消息 / 轮次" }).first()).toBeVisible();
		await expect(page.locator("div.p-3").filter({ hasText: "0 / 0" }).first()).toBeVisible();
	});
});

