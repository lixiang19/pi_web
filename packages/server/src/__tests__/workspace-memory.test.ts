import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, AssistantMessage, Model } from "@mariozechner/pi-ai";
import { createBackgroundJobQueue } from "../background-jobs.js";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import {
	applyExplicitMemoryCommand,
	buildWorkspaceMemoryInjection,
	createWorkspaceMemoryWorkers,
	enqueueSessionSummaryJob,
	type CreateAgentSessionFn,
	type SummaryCompleteFn,
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
	await fs.mkdir(path.join(workspaceDir, "记忆", "daily", "2026", "05"), { recursive: true });
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
				content: "实现任务 26/27，并更新文档。",
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
	await fs.writeFile(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
	return sessionFile;
};

const mockModel = {
	provider: "openai",
	id: "gpt-test",
	name: "gpt-test",
	reasoning: true,
} as Model<Api>;

const baseUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
	},
};

const createSummaryMessage = (text: string): AssistantMessage => ({
	role: "assistant",
	content: [{ type: "text", text }],
	api: "openai-responses",
	provider: "openai",
	model: "gpt-test",
	usage: baseUsage,
	stopReason: "stop",
	timestamp: Date.now(),
});

const createMockModelRegistry = () => ({
	refresh: vi.fn(),
	find: vi.fn((provider: string, modelId: string) =>
		provider === "openai" && modelId === "gpt-test" ? mockModel : undefined,
	),
	getAvailable: vi.fn(() => [mockModel]),
	getApiKeyAndHeaders: vi.fn(async () => ({
		ok: true as const,
		apiKey: "test-api-key",
		headers: { "x-provider": "openai" },
	})),
});

afterEach(async () => {
	await Promise.all(cleanupDirs.splice(0).map((targetPath) =>
		fs.rm(targetPath, { recursive: true, force: true }),
	));
	vi.clearAllMocks();
});

describe("workspace memory agents", () => {
	it("skips summary jobs whose session file was already removed", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const missingSessionFile = path.join(workspaceDir, "missing-session.jsonl");
		const job = queue.enqueue({
			type: "summary.daily",
			relatedType: "session",
			relatedId: "missing-session",
			payload: {
				sessionId: "missing-session",
				sessionFile: missingSessionFile,
				title: "已删除会话",
				cwd: workspaceDir,
				workspaceDir,
				dailyDate: "2026-05-15",
				dailyYear: "2026",
				dailyMonth: "05",
				dailyTime: "09:30",
				endedAt: Date.UTC(2026, 4, 15, 9, 30),
			},
			maxAttempts: 3,
			notifyOnFailure: true,
		});

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			completeFn: async () => {
				throw new Error("summary complete should not run for a missing session file");
			},
		});

		await workers.processSummaryJob();

		expect(queue.get(job.jobId)?.status).toBe("completed");
		expect(queue.get(job.jobId)?.result).toEqual({
			skipped: true,
			reason: "session_file_missing",
		});
		db.close();
	});

	it("uses pi-ai complete for summary and appends markdown directly to the daily timeline", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const sessionFile = await writeSessionFile(workspaceDir, "session-a");
		const completeFn = vi.fn(async () =>
			createSummaryMessage("### 完成摘要\n\n- 完成 daily 追加。\n- 更新记忆维护方向。"),
		) satisfies SummaryCompleteFn;
		const modelRegistry = createMockModelRegistry();

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			modelRegistry: modelRegistry as never,
			resolveBackgroundModel: async () => "openai/gpt-test",
			completeFn,
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
		expect(daily).toContain("## 09:30 session-a 实现任务 26/27");
		expect(daily).toContain("### 完成摘要");
		expect(daily).toContain("- 完成 daily 追加。");
		expect(daily).not.toContain("### L1-Atom");

		expect(completeFn).toHaveBeenCalledWith(
			mockModel,
			expect.objectContaining({
				systemPrompt: expect.stringContaining("summary agent"),
				messages: [
					expect.objectContaining({
						role: "user",
						content: expect.stringContaining("实现任务 26/27"),
					}),
				],
			}),
			expect.objectContaining({
				apiKey: "test-api-key",
				headers: { "x-provider": "openai" },
				temperature: 0.2,
			}),
		);
		expect(queue.list().map((item) => item.type)).toEqual(["summary.daily", "memory.maintain"]);
		db.close();
	});

	it("runs memory as a real internal agent that edits L2/L3 and calls the unified completion tool", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		await fs.writeFile(
			path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-15.md"),
			"# 2026-05-15\n\n## 12:30 session-memory\n\n- 用户明确：日期代表可信度。\n",
			"utf8",
		);
		await fs.mkdir(path.join(workspaceDir, "记忆", "scenarios"), { recursive: true });
		await fs.writeFile(
			path.join(workspaceDir, "记忆", "scenarios", "conversation-memory.md"),
			"# 对话记忆系统\n\n## 历史覆盖\n\n- 旧设想：日期只做审计索引。\n",
			"utf8",
		);

		let promptText = "";
		const activeToolNamesByCall: string[][] = [];
		const createAgentSessionFn: CreateAgentSessionFn = vi.fn(async (options) => {
			const session = {
				messages: [],
				getActiveToolNames: () => [
					"read",
					"edit",
					"bash",
					"ask",
					"subagent",
					"complete_internal_task",
				],
				setActiveToolsByName: vi.fn(async (names: string[]) => {
					activeToolNamesByCall.push(names);
				}),
				setModel: vi.fn(async () => {}),
				setThinkingLevel: vi.fn(async () => {}),
				prompt: vi.fn(async (prompt: string) => {
					promptText = prompt;
					await fs.writeFile(
						path.join(workspaceDir, "记忆", "MEMORY.md"),
						"# MEMORY\n\n- [module:memory][2026-05-15] 日期参与记忆可信度和冲突裁决。\n",
						"utf8",
					);
					await fs.writeFile(
						path.join(workspaceDir, "记忆", "scenarios", "conversation-memory.md"),
						"# 对话记忆系统\n\n## 当前结论\n\n- 日期代表可信度。\n",
						"utf8",
					);
					await options.completeInternalTask({
						status: "completed",
						summary: "已更新 MEMORY 与 conversation-memory 场景页。",
					});
				}),
			};
			return { session, extensionsResult: null };
		});

		const modelRegistry = createMockModelRegistry();
		queue.enqueue({
			type: "memory.maintain",
			relatedType: "workspace",
			relatedId: workspaceDir,
			payload: {
				workspaceDir,
				dailyDate: "2026-05-15",
				dailyYear: "2026",
				dailyMonth: "05",
			},
		});

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			modelRegistry: modelRegistry as never,
			resolveBackgroundModel: async () => "openai/gpt-test",
			createAgentSessionFn,
		});

		await workers.processMemoryJob();

		expect(promptText).toContain("今天 daily");
		expect(promptText).toContain("日期代表可信度");
		expect(promptText).toContain("现有 Scenario");
		expect(activeToolNamesByCall.at(-1)).toEqual([
			"read",
			"edit",
			"complete_internal_task",
		]);
		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.toContain("日期参与记忆可信度和冲突裁决");
		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "scenarios", "conversation-memory.md"), "utf8"),
		).resolves.toContain("日期代表可信度");
		const job = queue.list()[0];
		expect(job?.status).toBe("completed");
		expect(job?.result).toMatchObject({
			agentName: "memory-agent",
			status: "completed",
			summary: "已更新 MEMORY 与 conversation-memory 场景页。",
		});
		db.close();
	});

	it("fails memory maintenance when the real agent does not call complete_internal_task", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const queue = createBackgroundJobQueue(db, { retryDelaysMs: [0] });
		await fs.writeFile(
			path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-15.md"),
			"# 2026-05-15\n",
			"utf8",
		);
		queue.enqueue({
			type: "memory.maintain",
			relatedType: "workspace",
			relatedId: workspaceDir,
			payload: {
				workspaceDir,
				dailyDate: "2026-05-15",
				dailyYear: "2026",
				dailyMonth: "05",
			},
			maxAttempts: 1,
		});

		const workers = createWorkspaceMemoryWorkers({
			jobQueue: queue,
			workspaceDir,
			modelRegistry: createMockModelRegistry() as never,
			createAgentSessionFn: async () => ({
				session: {
					messages: [],
					getActiveToolNames: () => ["read", "edit", "complete_internal_task"],
					setActiveToolsByName: async () => undefined,
					prompt: async () => undefined,
				},
				extensionsResult: null,
			}),
		});

		await workers.processMemoryJob();

		const job = queue.list()[0];
		expect(job?.status).toBe("failed");
		expect(job?.lastError).toBe("memory-agent did not call complete_internal_task");
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
		).resolves.toMatch(/- \[global\]\[\d{4}-\d{2}-\d{2}\] 用户希望任务完成后运行 npm run check。/);

		await applyExplicitMemoryCommand(workspaceDir, "忘掉 用户希望任务完成后运行 npm run check");
		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.not.toContain("npm run check");
	});
});
