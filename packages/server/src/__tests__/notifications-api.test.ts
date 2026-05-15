import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBackgroundJobQueue } from "../background-jobs.js";
import { getRidgeDb, resetRidgeDb } from "../db/index.js";
import { createNotificationsRouter } from "../routes/notifications.js";
import {
	createMilestone,
	createTask,
	getMilestone,
	getTask,
	listMilestones,
	listTasks,
} from "../task-system.js";
import { createTempDir } from "../test/helpers.js";

const createApp = (workspaceDir: string, options?: { conversionEnabled?: boolean; withoutQueue?: boolean }) => {
	const jobQueue = createBackgroundJobQueue;
	const app = express();
	app.use(express.json());
	app.use(
		"/api/notifications",
		createNotificationsRouter({
			defaultWorkspaceDir: workspaceDir,
			getRidgeDb,
			getJobQueue: options?.withoutQueue ? undefined : async () => jobQueue(await getRidgeDb()),
			isConversionEnabled: () => options?.conversionEnabled ?? true,
		}),
	);
	app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
		res.status(err.statusCode ?? 500).json({ error: err.message });
	});
	return app;
};

describe("notifications api", () => {
	let workspaceDir = "";

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-notifications-");
		resetRidgeDb();
		vi.stubEnv("RIDGE_DB_PATH", `${workspaceDir}/ridge.db`);
		const db = await getRidgeDb();
		db.prepare("DELETE FROM notification_events").run();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetRidgeDb();
	});

	it("lists unhandled notifications with counts and derived actions", async () => {
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-file-1",
			"file_processing.convert_failed",
			"error",
			"文件转换失败: draft.pdf",
			"converter crashed",
			JSON.stringify({ filePath: `${workspaceDir}/附件/draft.pdf` }),
			"unread",
			2000,
			null,
			"file_processing",
			"file",
			`${workspaceDir}/附件/draft.pdf`,
			"[]",
			2000,
			null,
		);
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-old",
			"background_job.failed",
			"error",
			"旧通知",
			"handled",
			"{}",
			"handled",
			1000,
			null,
			"background_jobs",
			"background_job",
			"job-1",
			"[]",
			1000,
			1100,
		);
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-info",
			"system.info",
			"info",
			"普通信息",
			"只在全部里显示",
			"{}",
			"unread",
			1500,
			null,
			"system",
			null,
			null,
			"[]",
			1500,
			null,
		);

		const response = await request(createApp(workspaceDir))
			.get("/api/notifications?filter=unhandled")
			.expect(200);

		expect(response.body.counts).toMatchObject({
			unhandled: 1,
			handled: 1,
			failed: 2,
			all: 3,
		});
		expect(response.body.notifications).toHaveLength(1);
		expect(response.body.notifications[0]).toMatchObject({
			id: "notification-file-1",
			type: "failure",
			source: "file_processing",
			related: {
				type: "file",
				id: `${workspaceDir}/附件/draft.pdf`,
			},
		});
		expect(response.body.notifications[0].actions.map((action: { id: string }) => action.id)).toEqual(
			expect.arrayContaining(["retry", "open_related", "dismiss", "mark_handled"]),
		);
		expect(response.body.notifications.map((item: { id: string }) => item.id)).not.toContain("notification-info");

		const allResponse = await request(createApp(workspaceDir))
			.get("/api/notifications?filter=all")
			.expect(200);
		expect(allResponse.body.notifications.map((item: { id: string }) => item.id)).toContain("notification-info");
	});

	it("derives fallback related objects only from event-specific payload contracts", async () => {
		const db = await getRidgeDb();
		const insert = db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		insert.run(
			"notification-file-fallback",
			"file_processing.convert_failed",
			"error",
			"文件转换失败",
			"failed",
			JSON.stringify({ filePath: "/workspace/draft.pdf" }),
			"unread",
			3000,
			null,
			"file_processing",
			null,
			null,
			"[]",
			3000,
			null,
		);
		insert.run(
			"notification-system-payload",
			"system.info",
			"info",
			"系统信息",
			"payload 里有 filePath 但不是文件事件",
			JSON.stringify({ filePath: "/workspace/not-related.pdf" }),
			"unread",
			2000,
			null,
			"system",
			null,
			null,
			"[]",
			2000,
			null,
		);
		insert.run(
			"notification-confirmation",
			"user.confirmation",
			"info",
			"需要确认",
			"等待用户处理",
			"{}",
			"pending",
			1000,
			null,
			"user",
			null,
			null,
			"[]",
			1000,
			null,
		);

		const response = await request(createApp(workspaceDir))
			.get("/api/notifications?filter=all")
			.expect(200);
		const byId = new Map<string, { type: string; related: unknown; actions: Array<{ id: string }> }>(
			response.body.notifications.map((item: { id: string; type: string; related: unknown; actions: Array<{ id: string }> }) => [item.id, item]),
		);

		expect(byId.get("notification-file-fallback")).toMatchObject({
			related: { type: "file", id: "/workspace/draft.pdf" },
		});
		expect(byId.get("notification-file-fallback")?.actions.map((action) => action.id)).toContain("open_related");
		expect(byId.get("notification-system-payload")).toMatchObject({ related: null });
		expect(byId.get("notification-system-payload")?.actions.map((action) => action.id)).not.toContain("open_related");
		expect(byId.get("notification-confirmation")).toMatchObject({ type: "confirmation" });
	});

	it("derives retry for skipped automation notifications without producer actions", async () => {
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-automation-skipped",
			"automation.skipped",
			"warning",
			"自动化已跳过",
			"项目设备离线",
			JSON.stringify({ automationId: "automation-1" }),
			"unread",
			4000,
			null,
			"automation",
			"automation",
			"automation-1",
			"[]",
			4000,
			null,
		);

		const response = await request(createApp(workspaceDir))
			.get("/api/notifications?filter=unhandled")
			.expect(200);
		const notification = response.body.notifications.find(
			(item: { id: string }) => item.id === "notification-automation-skipped",
		);
		expect(notification.type).toBe("warning");
		expect(notification.actions.map((action: { id: string }) => action.id)).toEqual(
			expect.arrayContaining(["retry", "open_related", "dismiss", "mark_handled"]),
		);
	});

	it("accepts a task update suggestion only when the user chooses accept", async () => {
		const task = await createTask(workspaceDir, {
			title: "复盘任务",
			priority: "normal",
			acceptanceCriteria: "进入处理中",
		});
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-suggestion-1",
			"task_review.suggestion",
			"info",
			"任务回顾建议",
			"建议开始处理",
			JSON.stringify({
				suggestion: {
					kind: "task.update",
					taskId: task.id,
					patch: { status: "in_progress", actor: "user" },
				},
			}),
			"pending",
			3000,
			null,
			"task_review",
			"task",
			task.id,
			JSON.stringify([
				{ id: "accept_suggestion", label: "接受建议" },
				{ id: "reject_suggestion", label: "拒绝建议" },
			]),
			3000,
			null,
		);

		await expect(getTask(workspaceDir, task.id)).resolves.toMatchObject({ status: "pending" });

		const response = await request(createApp(workspaceDir))
			.post("/api/notifications/notification-suggestion-1/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);

		expect(response.body.notification).toMatchObject({
			id: "notification-suggestion-1",
			status: "handled",
		});
		await expect(getTask(workspaceDir, task.id)).resolves.toMatchObject({ status: "in_progress" });
		const row = db
			.prepare("SELECT status, handled_at FROM notification_events WHERE event_id = ?")
			.get("notification-suggestion-1") as { status: string; handled_at: number | null };
		expect(row.status).toBe("handled");
		expect(row.handled_at).toBeTypeOf("number");
	});

	it("supports the remaining suggestion actions and rejection without writing formal objects", async () => {
		const milestone = await createMilestone(workspaceDir, {
			title: "旧里程碑",
			goal: "旧目标",
			acceptanceCriteria: "旧验收",
		});
		const db = await getRidgeDb();
		const insert = db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		insert.run(
			"notification-task-create",
			"task_review.suggestion",
			"info",
			"建议创建任务",
			"新增任务",
			JSON.stringify({
				suggestion: {
					kind: "task.create",
					task: { title: "新建议任务", priority: "important", acceptanceCriteria: "完成" },
				},
			}),
			"pending",
			4000,
			null,
			"task_review",
			"task",
			"new-task",
			"[]",
			4000,
			null,
		);
		insert.run(
			"notification-milestone-update",
			"task_review.suggestion",
			"info",
			"建议更新里程碑",
			"推进状态",
			JSON.stringify({
				suggestion: {
					kind: "milestone.update",
					milestoneId: milestone.id,
					patch: { status: "in_progress", actor: "user" },
				},
			}),
			"pending",
			4100,
			null,
			"task_review",
			"milestone",
			milestone.id,
			"[]",
			4100,
			null,
		);
		insert.run(
			"notification-milestone-create",
			"task_review.suggestion",
			"info",
			"建议创建里程碑",
			"新增里程碑",
			JSON.stringify({
				suggestion: {
					kind: "milestone.create",
					milestone: { title: "新建议里程碑", goal: "目标", acceptanceCriteria: "验收" },
				},
			}),
			"pending",
			4200,
			null,
			"task_review",
			"milestone",
			"new-milestone",
			"[]",
			4200,
			null,
		);
		insert.run(
			"notification-reject",
			"task_review.suggestion",
			"info",
			"拒绝建议",
			"不创建任务",
			JSON.stringify({
				suggestion: {
					kind: "task.create",
					task: { title: "不应创建的任务", priority: "normal", acceptanceCriteria: "不会写入" },
				},
			}),
			"pending",
			4300,
			null,
			"task_review",
			"task",
			"rejected-task",
			"[]",
			4300,
			null,
		);

		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-task-create/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);
		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-milestone-update/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);
		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-milestone-create/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(200);
		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-reject/actions")
			.send({ actionId: "reject_suggestion" })
			.expect(200);

		expect((await listTasks(workspaceDir)).map((task) => task.title)).toContain("新建议任务");
		expect((await listTasks(workspaceDir)).map((task) => task.title)).not.toContain("不应创建的任务");
		await expect(getMilestone(workspaceDir, milestone.id)).resolves.toMatchObject({ status: "in_progress" });
		expect((await listMilestones(workspaceDir)).map((item) => item.title)).toContain("新建议里程碑");
		expect(
			db.prepare("SELECT status FROM notification_events WHERE event_id = ?").get("notification-reject"),
		).toEqual({ status: "dismissed" });
	});

	it("retries failed file notifications by returning the file to pending and queueing work", async () => {
		const db = await getRidgeDb();
		const filePath = `${workspaceDir}/附件/failure.pdf`;
		db.prepare(
			`INSERT INTO file_processing_status(
				file_path, workspace_path, status, error, updated_at
			) VALUES(?, ?, ?, ?, ?)`,
		).run(filePath, workspaceDir, "convert_failed", "failed", 1000);
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-retry-1",
			"file_processing.convert_failed",
			"error",
			"文件转换失败",
			"failed",
			JSON.stringify({ filePath }),
			"unread",
			1000,
			null,
			"file_processing",
			"file",
			filePath,
			"[]",
			1000,
			null,
		);

		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-retry-1/actions")
			.send({ actionId: "retry" })
			.expect(200);

		expect(
			db.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?").get(filePath),
		).toEqual({ status: "pending", error: null });
		expect(
			db.prepare("SELECT status, handled_at FROM notification_events WHERE event_id = ?").get("notification-retry-1"),
		).toMatchObject({ status: "handled" });
		expect(
			db.prepare("SELECT job_type, related_type, related_id FROM background_jobs WHERE related_id = ?").get(filePath),
		).toEqual({ job_type: "file.convert", related_type: "file", related_id: filePath });
	});

	it("does not mark file retry handled when the background queue is unavailable", async () => {
		const db = await getRidgeDb();
		const filePath = `${workspaceDir}/附件/no-queue.pdf`;
		db.prepare(
			`INSERT INTO file_processing_status(
				file_path, workspace_path, status, error, updated_at
			) VALUES(?, ?, ?, ?, ?)`,
		).run(filePath, workspaceDir, "convert_failed", "failed", 1000);
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-no-queue",
			"file_processing.convert_failed",
			"error",
			"文件转换失败",
			"failed",
			JSON.stringify({ filePath }),
			"unread",
			1000,
			null,
			"file_processing",
			"file",
			filePath,
			"[]",
			1000,
			null,
		);

		await request(createApp(workspaceDir, { withoutQueue: true }))
			.post("/api/notifications/notification-no-queue/actions")
			.send({ actionId: "retry" })
			.expect(503);

		expect(
			db.prepare("SELECT status, handled_at FROM notification_events WHERE event_id = ?").get("notification-no-queue"),
		).toEqual({ status: "unread", handled_at: null });
		expect(
			db.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?").get(filePath),
		).toEqual({ status: "convert_failed", error: "failed" });
	});

	it("rejects actions that are not available on the current notification", async () => {
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-info-action",
			"system.info",
			"info",
			"普通信息",
			"没有重试语义",
			"{}",
			"unread",
			1000,
			null,
			"system",
			null,
			null,
			"[]",
			1000,
			null,
		);

		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-info-action/actions")
			.send({ actionId: "retry" })
			.expect(400);

		expect(
			db.prepare("SELECT status, handled_at FROM notification_events WHERE event_id = ?").get("notification-info-action"),
		).toEqual({ status: "unread", handled_at: null });
	});

	it("rejects malformed suggestions without handling the notification", async () => {
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-bad-suggestion",
			"task_review.suggestion",
			"info",
			"坏建议",
			"缺少 suggestion payload",
			JSON.stringify({ suggestion: { kind: "unknown.kind" } }),
			"pending",
			1000,
			null,
			"task_review",
			"task",
			"task-missing",
			JSON.stringify([{ id: "accept_suggestion", label: "接受建议" }]),
			1000,
			null,
		);

		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-bad-suggestion/actions")
			.send({ actionId: "accept_suggestion" })
			.expect(400);

		expect(
			db.prepare("SELECT status, handled_at FROM notification_events WHERE event_id = ?").get("notification-bad-suggestion"),
		).toEqual({ status: "pending", handled_at: null });
		expect(await listTasks(workspaceDir)).toHaveLength(0);
		expect(await listMilestones(workspaceDir)).toHaveLength(1);
	});

	it("retries RAG and background job failure notifications through their real state tables", async () => {
		const db = await getRidgeDb();
		const ragPath = `${workspaceDir}/笔记/rag.md`;
		db.prepare(
			`INSERT INTO search_index_status(
				target_path, target_type, status, workspace_path, source_path,
				refresh_policy, last_event, error, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(ragPath, "file", "index_failed", workspaceDir, "笔记/rag.md", "immediate", "manual", "embed failed", 1000);
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-rag",
			"rag.index_failed",
			"error",
			"RAG 索引失败",
			"embed failed",
			JSON.stringify({ filePath: ragPath }),
			"unread",
			1000,
			null,
			"rag",
			"file",
			ragPath,
			"[]",
			1000,
			null,
		);
		const queue = createBackgroundJobQueue(db);
		const job = queue.enqueue({
			type: "summary.daily",
			payload: { day: "2026-05-15" },
			maxAttempts: 1,
		});
		const claimed = queue.claimNext("worker");
		expect(claimed?.jobId).toBe(job.jobId);
		queue.fail(job.jobId, new Error("agent failed"));
		db.prepare(
			`INSERT INTO notification_events(
				event_id, event_type, severity, title, body, payload_json,
				status, created_at, read_at, source, related_type, related_id,
				actions_json, updated_at, handled_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"notification-background",
			"background_job.failed",
			"error",
			"后台任务失败",
			"agent failed",
			JSON.stringify({ jobId: job.jobId }),
			"unread",
			1100,
			null,
			"background_jobs",
			"background_job",
			job.jobId,
			JSON.stringify([{ id: "open_related", label: "打开对象" }]),
			1100,
			null,
		);

		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-rag/actions")
			.send({ actionId: "retry" })
			.expect(200);
		await request(createApp(workspaceDir))
			.post("/api/notifications/notification-background/actions")
			.send({ actionId: "retry" })
			.expect(200);

		expect(
			db.prepare("SELECT status, error FROM search_index_status WHERE target_path = ?").get(ragPath),
		).toEqual({ status: "pending", error: null });
		expect(
			db.prepare("SELECT job_type, related_id FROM background_jobs WHERE related_id = ? AND job_type = 'rag.index'").get(ragPath),
		).toEqual({ job_type: "rag.index", related_id: ragPath });
		expect(
			db.prepare("SELECT status, retry_count, last_error FROM background_jobs WHERE job_id = ?").get(job.jobId),
		).toEqual({ status: "pending", retry_count: 0, last_error: null });

		const listResponse = await request(createApp(workspaceDir))
			.get("/api/notifications?filter=all")
			.expect(200);
		const backgroundNotification = listResponse.body.notifications.find(
			(item: { id: string }) => item.id === "notification-background",
		);
		expect(backgroundNotification.actions.map((action: { id: string }) => action.id)).not.toContain("open_related");
	});
});
