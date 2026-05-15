import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackgroundJobQueue } from "../background-jobs.js";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import {
	applyExplicitMemoryCommand,
	buildWorkspaceMemoryInjection,
	createWorkspaceMemoryWorkers,
	enqueueSessionSummaryJob,
} from "../workspace-memory.js";

const cleanupDirs: string[] = [];

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

const createWorkspace = async () => {
	const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-memory-"));
	cleanupDirs.push(workspaceDir);
	await fs.mkdir(path.join(workspaceDir, "记忆", "daily", "2026", "05"), {
		recursive: true,
	});
	await fs.mkdir(path.join(workspaceDir, "Wiki"), { recursive: true });
	await fs.writeFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "# MEMORY\n", "utf8");
	await fs.writeFile(path.join(workspaceDir, "Wiki", "index.md"), "# Wiki\n", "utf8");
	return workspaceDir;
};

const writeSessionFile = async (workspaceDir: string, sessionId: string) => {
	const sessionFile = path.join(workspaceDir, `${sessionId}.jsonl`);
	const entries = [
		{
			type: "message",
			message: {
				role: "user",
				content: "实现任务 26/27，并更新文档/功能开发/26-summary-agent-daily会话记忆.md",
				timestamp: Date.UTC(2026, 4, 15, 8, 0),
			},
		},
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "已实现 daily 与 MEMORY 维护链路。" }],
				timestamp: Date.UTC(2026, 4, 15, 8, 2),
			},
		},
	];
	await fs.writeFile(
		sessionFile,
		`${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
		"utf8",
	);
	return sessionFile;
};

afterEach(async () => {
	await Promise.all(
		cleanupDirs.splice(0).map((targetPath) =>
			fs.rm(targetPath, { recursive: true, force: true }),
		),
	);
});

describe("workspace memory agents", () => {
	it("appends a session summary to the daily timeline and queues memory maintenance", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const sessionFile = await writeSessionFile(workspaceDir, "session-a");

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			now: () => new Date(2026, 4, 15, 9, 30).getTime(),
			createAgentSessionFn: async () => ({
				session: {
					messages: [
						{
							role: "assistant",
							content: JSON.stringify({
								title: "任务 26/27 记忆链路",
								summary: "完成 summary daily 与 MEMORY 维护的后台链路。",
								decisions: ["会话结束后先写 daily，再维护 MEMORY。"],
								facts: ["daily 文件按日期目录追加。"],
								artifacts: ["文档/功能开发/26-summary-agent-daily会话记忆.md"],
							}),
						},
					],
					prompt: async () => undefined,
				},
				extensionsResult: null,
			}),
		});

		enqueueSessionSummaryJob(queue, {
			sessionId: "session-a",
			sessionFile,
			title: "实现任务 26/27",
			cwd: workspaceDir,
			workspaceDir,
			endedAt: new Date(2026, 4, 15, 9, 30).getTime(),
		});

		await workers.processSummaryJob();

		const daily = await fs.readFile(
			path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-15.md"),
			"utf8",
		);
		expect(daily).toContain("# 2026-05-15");
		expect(daily).toContain("## 09:30 session-a 任务 26/27 记忆链路");
		expect(daily).toContain("- 摘要：完成 summary daily 与 MEMORY 维护的后台链路。");
		expect(daily).toContain("  - 会话结束后先写 daily，再维护 MEMORY。");
		expect(daily).toContain("  - daily 文件按日期目录追加。");
		expect(daily).toContain("  - 文档/功能开发/26-summary-agent-daily会话记忆.md");

		await expect(
			fs.stat(path.join(workspaceDir, "记忆", "session-a.md")),
		).rejects.toMatchObject({ code: "ENOENT" });

		expect(queue.list().map((job) => job.type)).toEqual([
			"summary.daily",
			"memory.maintain",
		]);
		expect(queue.list()[0]).toMatchObject({ status: "completed" });
		db.close();
	});

	it("writes only the target daily date when a session ends after midnight", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const sessionFile = await writeSessionFile(workspaceDir, "session-midnight");
		const oldDailyPath = path.join(
			workspaceDir,
			"记忆",
			"daily",
			"2026",
			"05",
			"2026-05-15.md",
		);
		await fs.writeFile(oldDailyPath, "# 2026-05-15\n\n## 已存在\n", "utf8");

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			createAgentSessionFn: async () => ({
				session: {
					messages: [
						{
							role: "assistant",
							content: JSON.stringify({
								title: "跨日整理",
								summary: "会话在新日期结束。",
								decisions: [],
								facts: [],
								artifacts: [],
							}),
						},
					],
					prompt: async () => undefined,
				},
				extensionsResult: null,
			}),
		});

		enqueueSessionSummaryJob(queue, {
			sessionId: "session-midnight",
			sessionFile,
			title: "跨日会话",
			cwd: workspaceDir,
			workspaceDir,
			endedAt: new Date(2026, 4, 16, 0, 5).getTime(),
		});

		await workers.processSummaryJob();

		await expect(fs.readFile(oldDailyPath, "utf8")).resolves.toBe(
			"# 2026-05-15\n\n## 已存在\n",
		);
		const nextDaily = await fs.readFile(
			path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-16.md"),
			"utf8",
		);
		expect(nextDaily).toContain("## 00:05 session-midnight 跨日整理");
		db.close();
	});

	it("normalizes external project artifact paths before appending daily", async () => {
		const workspaceDir = await createWorkspace();
		const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "external-game-"));
		cleanupDirs.push(projectRoot);
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const sessionFile = await writeSessionFile(workspaceDir, "session-external");

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			createAgentSessionFn: async () => ({
				session: {
					messages: [
						{
							role: "assistant",
							content: JSON.stringify({
								title: "外部项目产物",
								summary: "完成外部项目修改。",
								decisions: [],
								facts: [],
								artifacts: [
									path.join(projectRoot, "src", "main.ts"),
									path.join(projectRoot, "docs", "README.md"),
								],
							}),
						},
					],
					prompt: async () => undefined,
				},
				extensionsResult: null,
			}),
		});

		enqueueSessionSummaryJob(queue, {
			sessionId: "session-external",
			sessionFile,
			title: "外部项目",
			cwd: projectRoot,
			workspaceDir,
			projectLabel: "external-game",
			projectRoot,
			endedAt: new Date(2026, 4, 15, 10, 15).getTime(),
		});

		await workers.processSummaryJob();

		const daily = await fs.readFile(
			path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-15.md"),
			"utf8",
		);
		expect(daily).toContain("  - external-game: src/main.ts");
		expect(daily).toContain("  - external-game: docs/README.md");
		expect(daily).not.toContain(projectRoot);
		db.close();
	});

	it("creates background agent sessions with the configured background model", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const sessionFile = await writeSessionFile(workspaceDir, "session-model");
		const createAgentSessionFn = vi.fn(async () => ({
			session: {
				messages: [
					{
						role: "assistant",
						content: JSON.stringify({
							title: "模型配置",
							summary: "后台模型被显式选择。",
							decisions: [],
							facts: [],
							artifacts: [],
						}),
					},
				],
				prompt: async () => undefined,
			},
			extensionsResult: null,
		}));
		const modelRegistry = {
			refresh: vi.fn(),
			find: vi.fn(() => ({
				provider: "openai",
				id: "gpt-test",
				name: "gpt-test",
			})),
		};

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			modelRegistry: modelRegistry as never,
			resolveBackgroundModel: async () => "openai/gpt-test",
			resolveBackgroundThinkingLevel: async () => "low",
			createAgentSessionFn,
		});

		enqueueSessionSummaryJob(queue, {
			sessionId: "session-model",
			sessionFile,
			title: "模型配置",
			cwd: workspaceDir,
			workspaceDir,
			endedAt: new Date(2026, 4, 15, 11, 0).getTime(),
		});

		await workers.processSummaryJob();

		expect(modelRegistry.find).toHaveBeenCalledWith("openai", "gpt-test");
		expect(createAgentSessionFn).toHaveBeenCalledWith(
			expect.objectContaining({
				model: expect.objectContaining({ provider: "openai", id: "gpt-test" }),
				thinkingLevel: "low",
				noTools: "all",
			}),
		);
		db.close();
	});

	it("injects MEMORY and Wiki only when they contain body content", async () => {
		const workspaceDir = await createWorkspace();

		expect(await buildWorkspaceMemoryInjection(workspaceDir)).toBe("");

		await fs.writeFile(
			path.join(workspaceDir, "记忆", "MEMORY.md"),
			"# MEMORY\n\n- 用户偏好：先写测试再实现。\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(workspaceDir, "Wiki", "index.md"),
			"# Wiki\n\n- [[任务系统]]\n",
			"utf8",
		);

		const injected = await buildWorkspaceMemoryInjection(workspaceDir);
		expect(injected).toContain("<ridge_memory>");
		expect(injected).toContain("记忆可能过时，当前用户最新话语和当前文件事实优先。");
		expect(injected).toContain("用户偏好：先写测试再实现");
		expect(injected).toContain("<ridge_wiki_index>");
		expect(injected).toContain("[[任务系统]]");
	});

	it("updates MEMORY immediately for explicit remember and forget commands", async () => {
		const workspaceDir = await createWorkspace();

		await applyExplicitMemoryCommand(workspaceDir, "请记住：用户希望任务完成后运行 npm run check。");
		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.toContain("- 用户希望任务完成后运行 npm run check。");

		await applyExplicitMemoryCommand(workspaceDir, "忘掉 用户希望任务完成后运行 npm run check");
		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.not.toContain("npm run check");
	});

	it("does not write secrets into MEMORY", async () => {
		const workspaceDir = await createWorkspace();

		await applyExplicitMemoryCommand(workspaceDir, "记住 token 是 sk-test-secret");
		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.toBe("# MEMORY\n");
	});
});
