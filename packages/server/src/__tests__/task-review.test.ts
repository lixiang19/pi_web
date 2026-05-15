import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBackgroundJobQueue } from "../background-jobs.js";
import { getRidgeDb, resetRidgeDb } from "../db/index.js";
import { createNotificationsRouter } from "../routes/notifications.js";
import { createWorkspaceTasksRouter, type WorkspaceTasksRouterDeps } from "../routes/workspace-tasks.js";
import {
	createTaskReviewWorkers,
	runTaskReview,
} from "../task-review.js";
import { createMilestone, createTask, getTask, listMilestones, listTasks } from "../task-system.js";
import { createTempDir } from "../test/helpers.js";
import type { SessionRecord, SessionSnapshot, ThinkingLevel } from "../types/index.js";

const createProcessingDeps = (now: number): WorkspaceTasksRouterDeps => ({
	createSessionRecord: vi.fn(async (params) => ({
		id: "session-from-processing-route",
		cwd: params.cwd,
		sessionFile: path.join(params.cwd, ".ridge", "session-from-processing-route.json"),
		status: "idle",
		createdAt: now,
		updatedAt: now,
		session: {} as unknown as SessionRecord["session"],
		settingsManager: {} as unknown,
		resourceLoader: {} as unknown,
		unsubscribe: null,
		clients: new Set(),
		defaultToolNames: [],
		pendingAskRecords: new Map(),
		pendingPermissionRecords: new Map(),
		runtimePermissionRules: {},
		selectedAgentName: undefined,
		selectedAgentConfig: null,
		selectedAgentSignature: "",
		explicitModelSpec: undefined,
		explicitThinkingLevel: undefined,
		resolvedModelSpec: undefined,
		resolvedThinkingLevel: undefined,
		selectedPermissionPolicy: null,
		turnBudget: { maxTurns: undefined, usedTurns: 0, exhausted: false },
	}) as unknown as SessionRecord),
	applyTaskSessionAgentSelection: vi.fn(async () => {}),
	persistSessionRecordMetadata: vi.fn(async () => {}),
	upsertIndexedSessionRecord: vi.fn(async () => {}),
	toSessionSnapshot: vi.fn(async (record) => ({
		id: record.id,
		title: record.session.sessionName || record.id,
		cwd: record.cwd,
		status: "idle",
		createdAt: now,
		updatedAt: now,
		archived: false,
		messages: [],
		historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
		interactiveRequests: [],
		permissionRequests: [],
	}) as unknown as SessionSnapshot),
	getProjects: vi.fn(async () => ({ projects: [] })),
	getDefaultModel: vi.fn(async () => ""),
	getDefaultThinkingLevel: vi.fn(async () => "medium" as ThinkingLevel),
	projectContextResolver: {
		resolveContext: vi.fn(async (cwd) => ({
			isGit: false,
			projectId: cwd,
			projectRoot: cwd,
			projectLabel: path.basename(cwd),
			worktreeRoot: cwd,
			worktreeLabel: path.basename(cwd),
			branch: undefined,
			worktrees: [{ path: cwd, branch: undefined, label: path.basename(cwd) }],
		})),
		isPathInsideRoot: vi.fn((candidate, root) => {
			const relative = path.relative(root, candidate);
			return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
		}),
		invalidateContext: vi.fn(),
	},
	workspaceChatConfig: {
		workspaceDir: "/tmp/workspace",
		chatProjectId: "test-project",
		chatProjectPath: "/tmp/workspace",
		chatProjectLabel: "Test",
	},
});

const createApp = (
	workspaceDir: string,
	queue: ReturnType<typeof createBackgroundJobQueue>,
	deps: WorkspaceTasksRouterDeps = {},
) => {
	const app = express();
	app.use(express.json());
	app.use(
		"/api/workspace/tasks",
		createWorkspaceTasksRouter(workspaceDir, {
			...deps,
			getJobQueue: () => queue,
		}),
	);
	app.use(
		"/api/notifications",
		createNotificationsRouter({
			defaultWorkspaceDir: workspaceDir,
			getRidgeDb,
			getJobQueue: async () => queue,
			isConversionEnabled: () => true,
		}),
	);
	app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
		res.status(err.statusCode ?? 500).json({ error: err.message });
	});
	return app;
};

describe("task review agent", () => {
	let workspaceDir = "";

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-task-review-");
		resetRidgeDb();
		vi.stubEnv("RIDGE_DB_PATH", `${workspaceDir}/ridge.db`);
		const db = await getRidgeDb();
		db.prepare("DELETE FROM notification_events").run();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
		db.prepare("DELETE FROM session_index").run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetRidgeDb();
	});

	it("creates review suggestions from tasks, milestones, processing sessions, and recent daily without mutating tasks", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const overdue = await createTask(workspaceDir, {
			title: "补齐结算 API",
			priority: "normal",
			acceptanceCriteria: "接口通过集成测试",
			dueDate: now - 86_400_000,
		});
		const blocked = await createTask(workspaceDir, {
			title: "修复上传流程",
			priority: "important",
			acceptanceCriteria: "上传失败可恢复",
		});
		const reviewing = await createTask(workspaceDir, {
			title: "整理任务回顾文档",
			priority: "normal",
			acceptanceCriteria: "文档完整",
		});
		const milestone = await createMilestone(workspaceDir, {
			title: "五月交付",
			goal: "完成核心闭环",
			acceptanceCriteria: "任务全部进入完成或审核",
			dueDate: now - 86_400_000,
		});
		const milestoneTask = await createTask(workspaceDir, {
			title: "里程碑剩余任务",
			priority: "normal",
			acceptanceCriteria: "完成",
			milestoneId: milestone.id,
		});

		const db = await getRidgeDb();
		db.prepare("UPDATE workspace_tasks SET status = 'blocked', blocked_reason = ?, updated_at = ? WHERE task_id = ?")
			.run("等待接口账号", now - 4 * 86_400_000, blocked.id);
		db.prepare("UPDATE workspace_tasks SET status = 'reviewing', updated_at = ? WHERE task_id = ?")
			.run(now - 2 * 86_400_000, reviewing.id);
		db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path,
				project_id, task_id, device_id, run_location, archived, created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"session-reviewing",
			"整理任务回顾文档",
			"task",
			"workspace",
			workspaceDir,
			null,
			reviewing.id,
			null,
			"server",
			0,
			now - 3 * 86_400_000,
			now - 2 * 86_400_000,
		);
		const dailyDir = path.join(workspaceDir, "记忆", "daily", "2026", "05");
		await fs.mkdir(dailyDir, { recursive: true });
		await fs.writeFile(
			path.join(dailyDir, "2026-05-15.md"),
			"# 2026-05-15\n\n## 10:00 session-reviewing 整理任务回顾文档\n- 摘要：整理任务回顾文档 已完成，等待用户确认。\n",
			"utf8",
		);

		const result = await runTaskReview(db, {
			workspaceDir,
			now: () => now,
			trigger: "manual",
		});

		expect(result.created).toBeGreaterThanOrEqual(4);
		expect(await getTask(workspaceDir, overdue.id)).toMatchObject({
			priority: "normal",
			status: "pending",
		});
		expect(await getTask(workspaceDir, blocked.id)).toMatchObject({
			status: "blocked",
			blockedReason: "等待接口账号",
		});
		expect(await getTask(workspaceDir, milestoneTask.id)).toMatchObject({ status: "pending" });

		const notifications = db
			.prepare("SELECT event_type, source, related_type, related_id, payload_json FROM notification_events ORDER BY created_at ASC")
			.all() as Array<{ event_type: string; source: string; related_type: string; related_id: string; payload_json: string }>;
		expect(notifications.every((row) => row.event_type === "task_review.suggestion")).toBe(true);
		expect(notifications.every((row) => row.source === "task_review")).toBe(true);
		expect(notifications.map((row) => row.related_id)).toEqual(
			expect.arrayContaining([overdue.id, blocked.id, reviewing.id, milestone.id]),
		);
		const reviewingPayload = notifications
			.map((row) => JSON.parse(row.payload_json) as Record<string, unknown>)
			.find((payload) => payload.relatedTaskId === reviewing.id);
		expect(reviewingPayload).toMatchObject({
			suggestionType: "confirm_complete",
			relatedTaskId: reviewing.id,
			proposedAction: "请用户确认任务是否已经完成",
		});
		expect(String(reviewingPayload?.reason)).toContain("recent daily");
	});

	it("applies a review suggestion only after the user accepts the notification", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const task = await createTask(workspaceDir, {
			title: "过期任务",
			priority: "normal",
			acceptanceCriteria: "完成",
			dueDate: now - 86_400_000,
		});
		const db = await getRidgeDb();

		await runTaskReview(db, { workspaceDir, now: () => now, trigger: "manual" });

		expect(await getTask(workspaceDir, task.id)).toMatchObject({ priority: "normal" });
		const row = db
			.prepare("SELECT event_id FROM notification_events WHERE related_id = ? AND status = 'pending'")
			.get(task.id) as { event_id: string };

		await request(createApp(workspaceDir, createBackgroundJobQueue(db)))
			.post(`/api/notifications/${row.event_id}/actions`)
			.send({ actionId: "accept_suggestion" })
			.expect(200);

		expect(await getTask(workspaceDir, task.id)).toMatchObject({ priority: "urgent" });
		expect(
			db.prepare("SELECT status FROM notification_events WHERE event_id = ?").get(row.event_id),
		).toEqual({ status: "handled" });
	});

	it("enqueues a manual review job and the worker writes suggestions", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const task = await createTask(workspaceDir, {
			title: "手动触发回顾",
			priority: "normal",
			acceptanceCriteria: "完成",
			dueDate: now - 86_400_000,
		});
		const db = await getRidgeDb();
		const queue = createBackgroundJobQueue(db, { now: () => now });

		const response = await request(createApp(workspaceDir, queue))
			.post("/api/workspace/tasks/review")
			.expect(202);
		expect(response.body.job).toMatchObject({
			type: "task.review",
			relatedType: "workspace",
			relatedId: workspaceDir,
			status: "pending",
		});

		const workers = createTaskReviewWorkers({
			db,
			jobQueue: queue,
			workspaceDir,
			now: () => now,
		});
		await workers.processReviewJob();

		expect(queue.list()[0]).toMatchObject({ status: "completed" });
		expect(
			db.prepare("SELECT related_id FROM notification_events WHERE related_id = ?").get(task.id),
		).toEqual({ related_id: task.id });
	});

	it("uses the latest active processing session and ignores archived session index rows", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const task = await createTask(workspaceDir, {
			title: "进行中的任务",
			priority: "normal",
			acceptanceCriteria: "完成",
		});
		const db = await getRidgeDb();
		db.prepare("UPDATE workspace_tasks SET status = 'in_progress', updated_at = ? WHERE task_id = ?")
			.run(now - 60_000, task.id);
		const insertSession = db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path,
				project_id, task_id, device_id, run_location, archived, created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		insertSession.run(
			"session-old",
			"旧处理会话",
			"task",
			"workspace",
			workspaceDir,
			null,
			task.id,
			null,
			"server",
			0,
			now - 10 * 86_400_000,
			now - 10 * 86_400_000,
		);
		insertSession.run(
			"session-archived",
			"归档处理会话",
			"task",
			"workspace",
			workspaceDir,
			null,
			task.id,
			null,
			"server",
			1,
			now - 9 * 86_400_000,
			now - 9 * 86_400_000,
		);
		insertSession.run(
			"session-fresh",
			"最新处理会话",
			"task",
			"workspace",
			workspaceDir,
			null,
			task.id,
			null,
			"server",
			0,
			now - 60_000,
			now - 60_000,
		);

		const result = await runTaskReview(db, { workspaceDir, now: () => now, trigger: "manual" });

		expect(result.suggestions.map((item) => item.suggestionType)).not.toContain("next_step");
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM notification_events WHERE related_id = ?").get(task.id),
		).toEqual({ count: 0 });
	});

	it("detects stale sessions from the real task processing-session link", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const task = await createTask(workspaceDir, {
			title: "真实处理会话停滞",
			priority: "normal",
			acceptanceCriteria: "完成",
		});
		const db = await getRidgeDb();
		const app = createApp(workspaceDir, createBackgroundJobQueue(db), createProcessingDeps(now));

		const response = await request(app)
			.post(`/api/workspace/tasks/${task.id}/processing-session`)
			.expect(201);
		db.prepare("UPDATE workspace_tasks SET status = 'in_progress', updated_at = ? WHERE task_id = ?")
			.run(now - 60_000, task.id);
		db.prepare(
			`INSERT INTO sessions(
				session_id, title, cwd, session_file, created_at, updated_at, archived
			) VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(
			response.body.sessionId,
			"真实处理会话停滞",
			workspaceDir,
			path.join(workspaceDir, "session.json"),
			now - 4 * 86_400_000,
			now - 4 * 86_400_000,
			0,
		);

		const result = await runTaskReview(db, { workspaceDir, now: () => now, trigger: "manual" });

		expect(result.suggestions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					suggestionType: "next_step",
					relatedTaskId: task.id,
				}),
			]),
		);
		expect(
			db.prepare("SELECT related_id FROM notification_events WHERE related_id = ?").get(task.id),
		).toEqual({ related_id: task.id });
	});

	it("ignores session_index freshness for tasks with a bound processing session", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const task = await createTask(workspaceDir, {
			title: "绑定会话优先",
			priority: "normal",
			acceptanceCriteria: "完成",
		});
		const db = await getRidgeDb();
		db.prepare("UPDATE workspace_tasks SET status = 'in_progress', processing_session_id = ?, updated_at = ? WHERE task_id = ?")
			.run("session-bound-fresh", now - 60_000, task.id);
		db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path,
				project_id, task_id, device_id, run_location, archived, created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"session-bound-fresh",
			"陈旧索引不应生效",
			"task",
			"workspace",
			workspaceDir,
			null,
			task.id,
			null,
			"server",
			0,
			now - 5 * 86_400_000,
			now - 5 * 86_400_000,
		);

		const result = await runTaskReview(db, { workspaceDir, now: () => now, trigger: "manual" });

		expect(result.suggestions.map((item) => item.suggestionType)).not.toContain("next_step");
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM notification_events WHERE related_id = ?").get(task.id),
		).toEqual({ count: 0 });
	});

	it("uses session_index as a fallback only when a task has no bound processing session", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const task = await createTask(workspaceDir, {
			title: "未绑定索引补充",
			priority: "normal",
			acceptanceCriteria: "完成",
		});
		const db = await getRidgeDb();
		db.prepare("UPDATE workspace_tasks SET status = 'in_progress', updated_at = ? WHERE task_id = ?")
			.run(now - 60_000, task.id);
		db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path,
				project_id, task_id, device_id, run_location, archived, created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"session-index-fallback",
			"未绑定索引补充",
			"task",
			"workspace",
			workspaceDir,
			null,
			task.id,
			null,
			"server",
			0,
			now - 4 * 86_400_000,
			now - 4 * 86_400_000,
		);

		const result = await runTaskReview(db, { workspaceDir, now: () => now, trigger: "manual" });

		expect(result.suggestions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					suggestionType: "next_step",
					relatedTaskId: task.id,
				}),
			]),
		);
	});

	it("does not duplicate task.create suggestions when the same notification is accepted twice", async () => {
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-create-once",
			"task_review.suggestion",
			"info",
			"建议创建拆分任务",
			"创建一个拆分任务",
			JSON.stringify({
				suggestion: {
					kind: "task.create",
					task: {
						title: "拆分任务只创建一次",
						priority: "normal",
						acceptanceCriteria: "完成",
					},
				},
			}),
			"pending",
			1000,
			null,
			"task_review",
			"task",
			"task-split",
			JSON.stringify([{ id: "accept_suggestion", label: "接受建议" }]),
			1000,
			null,
		);

		const app = createApp(workspaceDir, createBackgroundJobQueue(db));
		await request(app)
			.post("/api/notifications/notification-create-once/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);
		await request(app)
			.post("/api/notifications/notification-create-once/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);

		expect((await listTasks(workspaceDir)).filter((item) => item.title === "拆分任务只创建一次")).toHaveLength(1);
	});

	it("does not duplicate milestone.create suggestions when the same notification is accepted twice", async () => {
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-create-milestone-once",
			"task_review.suggestion",
			"info",
			"建议创建里程碑",
			"创建一个里程碑",
			JSON.stringify({
				suggestion: {
					kind: "milestone.create",
					milestone: {
						title: "建议里程碑只创建一次",
						goal: "目标",
						acceptanceCriteria: "验收",
					},
				},
			}),
			"pending",
			1000,
			null,
			"task_review",
			"milestone",
			"milestone-suggested",
			JSON.stringify([{ id: "accept_suggestion", label: "接受建议" }]),
			1000,
			null,
		);

		const app = createApp(workspaceDir, createBackgroundJobQueue(db));
		await request(app)
			.post("/api/notifications/notification-create-milestone-once/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);
		await request(app)
			.post("/api/notifications/notification-create-milestone-once/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);

		expect((await listMilestones(workspaceDir)).filter((item) => item.title === "建议里程碑只创建一次")).toHaveLength(1);
	});

	it("serializes task review jobs for the same workspace", async () => {
		const now = Date.UTC(2026, 4, 15, 10, 0, 0);
		const db = await getRidgeDb();
		const queue = createBackgroundJobQueue(db, { now: () => now });
		queue.enqueue({
			type: "task.review",
			relatedType: "workspace",
			relatedId: workspaceDir,
			payload: { workspaceDir, trigger: "manual" },
		});
		queue.enqueue({
			type: "task.review",
			relatedType: "workspace",
			relatedId: `${workspaceDir}-other`,
			payload: { workspaceDir: `${workspaceDir}-other`, trigger: "manual" },
		});

		const first = queue.claimNext("review-worker-a", "task.review");
		const second = queue.claimNext("review-worker-b", "task.review");

		expect(first).toMatchObject({ relatedId: workspaceDir, status: "running" });
		expect(second).toMatchObject({ relatedId: `${workspaceDir}-other`, status: "running" });
		expect(queue.claimNext("review-worker-c", "task.review")).toBeNull();
	});
});
