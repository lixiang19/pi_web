import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getRidgeDb } from "../db/index.js";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

let api: ReturnType<typeof request.agent>;
const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

async function bindTaskProcessingSession(taskId: string): Promise<string> {
	const sessionId = `session-task-${taskId}`;
	const db = await getRidgeDb();
	db.prepare(
		`UPDATE workspace_tasks
		 SET processing_session_id = ?, updated_at = ?
		 WHERE task_id = ?`,
	).run(sessionId, Date.now(), taskId);
	db.prepare(
		`INSERT INTO session_index(
			session_id, title, session_type, context_type, workspace_path,
			project_id, task_id, device_id, run_location, archived, created_at, updated_at
		)
		VALUES(?, ?, 'task', 'project', ?, NULL, ?, NULL, 'server', 0, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			session_type = excluded.session_type,
			context_type = excluded.context_type,
			workspace_path = excluded.workspace_path,
			task_id = excluded.task_id,
			run_location = excluded.run_location,
			archived = excluded.archived,
			updated_at = excluded.updated_at`,
	).run(sessionId, "测试任务处理会话", WORKSPACE, taskId, Date.now(), Date.now());
	return sessionId;
}

beforeEach(async () => {
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(WORKSPACE, { recursive: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM workspace_tasks").run();
	db.prepare("DELETE FROM workspace_milestones").run();
});

describe("workspace task system", () => {
	it("creates the default unassigned milestone on first milestone query", async () => {
		const res = await api.get("/api/workspace/milestones");

		expect(res.status).toBe(200);
		expect(res.body.milestones).toHaveLength(1);
		expect(res.body.milestones[0]).toMatchObject({
			title: "未归属",
			status: "pending",
			isSystem: true,
		});
	});

	it("creates a milestone with pending status", async () => {
		const res = await api.post("/api/workspace/milestones").send({
			title: "M1",
			goal: "完成任务系统基础能力",
			acceptanceCriteria: "任务和里程碑都可管理",
		});

		expect(res.status).toBe(201);
		expect(res.body.milestone).toMatchObject({
			title: "M1",
			status: "pending",
			isSystem: false,
			taskCount: 0,
		});
	});

	it("creates a task under the default milestone when no milestone is provided", async () => {
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "实现任务创建",
			priority: "important",
			acceptanceCriteria: "创建后可在列表中看到",
		});

		expect(taskRes.status).toBe(201);
		expect(taskRes.body.task).toMatchObject({
			title: "实现任务创建",
			priority: "important",
			status: "pending",
		});

		const milestoneRes = await api.get("/api/workspace/milestones");
		const defaultMilestone = milestoneRes.body.milestones.find(
			(milestone: { title: string }) => milestone.title === "未归属",
		);
		expect(taskRes.body.task.milestoneId).toBe(defaultMilestone.id);
		expect(defaultMilestone.taskCount).toBe(1);
	});

	it("returns task and milestone details", async () => {
		const milestoneRes = await api.post("/api/workspace/milestones").send({
			title: "M2",
			goal: "验证详情",
			acceptanceCriteria: "详情字段完整",
		});
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "详情任务",
			priority: "normal",
			acceptanceCriteria: "可打开详情",
			milestoneId: milestoneRes.body.milestone.id,
		});

		const detailRes = await api.get(
			`/api/workspace/tasks/${taskRes.body.task.id}`,
		);
		const milestoneDetailRes = await api.get(
			`/api/workspace/milestones/${milestoneRes.body.milestone.id}`,
		);

		expect(detailRes.status).toBe(200);
		expect(detailRes.body.task.title).toBe("详情任务");
		expect(milestoneDetailRes.status).toBe(200);
		expect(milestoneDetailRes.body.milestone.taskCount).toBe(1);
	});

	it("allows a user to complete a task", async () => {
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "人工完成任务",
			priority: "urgent",
			acceptanceCriteria: "用户确认完成",
		});
		await api
			.patch(`/api/workspace/tasks/${taskRes.body.task.id}`)
			.send({ status: "in_progress", actor: "user" });
		await api
			.patch(`/api/workspace/tasks/${taskRes.body.task.id}`)
			.send({ status: "reviewing", actor: "user" });

		const completeRes = await api
			.patch(`/api/workspace/tasks/${taskRes.body.task.id}`)
			.send({ status: "completed", actor: "user" });

		expect(completeRes.status).toBe(200);
		expect(completeRes.body.task.status).toBe("completed");
	});

	it("rejects invalid status transitions", async () => {
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "非法流转",
			priority: "normal",
			acceptanceCriteria: "不能跳过状态",
		});

		const res = await api
			.patch(`/api/workspace/tasks/${taskRes.body.task.id}`)
			.send({ status: "completed", actor: "user" });

		expect(res.status).toBe(400);
	});

	it("rejects agent completion for tasks and milestones", async () => {
		const milestoneRes = await api.post("/api/workspace/milestones").send({
			title: "Agent 限制",
			goal: "验证权限",
			acceptanceCriteria: "Agent 不能完成",
		});
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "Agent 任务",
			priority: "normal",
			acceptanceCriteria: "Agent 只能到审核中",
			milestoneId: milestoneRes.body.milestone.id,
		});

		const taskCompleteRes = await api
			.patch(`/api/workspace/tasks/${taskRes.body.task.id}`)
			.send({ status: "completed", actor: "agent" });
		const milestoneCompleteRes = await api
			.patch(`/api/workspace/milestones/${milestoneRes.body.milestone.id}`)
			.send({ status: "completed", actor: "agent" });

		expect(taskCompleteRes.status).toBe(400);
		expect(milestoneCompleteRes.status).toBe(400);
	});

	it("rejects completing the default unassigned milestone", async () => {
		const milestonesRes = await api.get("/api/workspace/milestones");
		const defaultMilestone = milestonesRes.body.milestones[0];

		const res = await api
			.patch(`/api/workspace/milestones/${defaultMilestone.id}`)
			.send({ status: "completed", actor: "user" });

		expect(res.status).toBe(400);
	});

	it("returns 404 when creating a task with non-existent milestoneId", async () => {
		const res = await api.post("/api/workspace/tasks").send({
			title: "未知里程碑任务",
			priority: "normal",
			acceptanceCriteria: "应该失败",
			milestoneId: "milestone-nonexistent",
		});

		expect(res.status).toBe(404);
	});

	it("rejects deleting the system default milestone", async () => {
		const milestonesRes = await api.get("/api/workspace/milestones");
		const defaultMilestone = milestonesRes.body.milestones[0];

		const res = await api.delete(`/api/workspace/milestones/${defaultMilestone.id}`);

		expect(res.status).toBe(400);
	});

	it("allows task projectId to override milestone projectId explicitly", async () => {
		const app = api;

		// Create milestone with projectId
		const milestoneRes = await app
			.post("/api/workspace/milestones")
			.send({
				title: "里程碑 B",
				goal: "目标",
				acceptanceCriteria: "标准",
				projectId: "project-beta",
			});
		const milestoneId = milestoneRes.body.milestone.id;

		// Create task with explicit different projectId
		const taskRes = await app
			.post("/api/workspace/tasks")
			.send({
				title: "覆盖项目任务",
				priority: "normal",
				acceptanceCriteria: "标准",
				milestoneId,
				projectId: "project-gamma",
			});

		expect(taskRes.status).toBe(201);
		expect(taskRes.body.task.projectId).toBe("project-gamma");
	});

	it("allows task explicit projectId null to not inherit from milestone", async () => {
		const app = api;

		// Create milestone with projectId
		const milestoneRes = await app
			.post("/api/workspace/milestones")
			.send({
				title: "里程碑 C",
				goal: "目标",
				acceptanceCriteria: "标准",
				projectId: "project-delta",
			});
		const milestoneId = milestoneRes.body.milestone.id;

		// Create task with explicit null projectId (should not inherit)
		const taskRes = await app
			.post("/api/workspace/tasks")
			.send({
				title: "显式无项目任务",
				priority: "normal",
				acceptanceCriteria: "标准",
				milestoneId,
				projectId: null,
			});

		expect(taskRes.status).toBe(201);
		expect(taskRes.body.task.projectId).toBeNull();
	});

	it("rejects invalid priority values", async () => {
		const res = await api.post("/api/workspace/tasks").send({
			title: "错误优先级",
			priority: "high",
			acceptanceCriteria: "应该失败",
		});

		expect(res.status).toBe(400);
	});

	it("rejects invalid status values on update", async () => {
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "错误状态",
			priority: "normal",
			acceptanceCriteria: "应该失败",
		});

		const res = await api
			.patch(`/api/workspace/tasks/${taskRes.body.task.id}`)
			.send({ status: "archived", actor: "user" });

		expect(res.status).toBe(400);
	});

	it("allows a user to complete a milestone through valid status transitions", async () => {
		const milestoneRes = await api.post("/api/workspace/milestones").send({
			title: "可完成里程碑",
			goal: "验证流转",
			acceptanceCriteria: "用户可完成",
		});
		const id = milestoneRes.body.milestone.id;

		await api.patch(`/api/workspace/milestones/${id}`).send({ status: "in_progress", actor: "user" });
		await api.patch(`/api/workspace/milestones/${id}`).send({ status: "reviewing", actor: "user" });

		const completeRes = await api
			.patch(`/api/workspace/milestones/${id}`)
			.send({ status: "completed", actor: "user" });

		expect(completeRes.status).toBe(200);
		expect(completeRes.body.milestone.status).toBe("completed");
	});

	it("inherits updated milestone projectId when creating a task without explicit projectId", async () => {
		const milestoneRes = await api.post("/api/workspace/milestones").send({
			title: "里程碑 D",
			goal: "目标",
			acceptanceCriteria: "标准",
			projectId: "project-initial",
		});
		const milestoneId = milestoneRes.body.milestone.id;

		// Update milestone projectId
		await api
			.patch(`/api/workspace/milestones/${milestoneId}`)
			.send({ projectId: "project-updated", actor: "user" });

		// Create task without explicit projectId should inherit updated project
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "继承更新后项目任务",
			priority: "normal",
			acceptanceCriteria: "标准",
			milestoneId,
		});

		expect(taskRes.status).toBe(201);
		expect(taskRes.body.task.projectId).toBe("project-updated");
	});

	it("presists blockedReason, dueDate, acceptanceCriteria and sortOrder on create and update", async () => {
		const milestoneRes = await api.post("/api/workspace/milestones").send({
			title: "字段验证里程碑",
			goal: "目标",
			acceptanceCriteria: "标准",
		});
		const milestoneId = milestoneRes.body.milestone.id;

		const createRes = await api.post("/api/workspace/tasks").send({
			title: "字段完整任务",
			priority: "urgent",
			acceptanceCriteria: "必须有完成标准",
			dueDate: new Date("2026-06-01").getTime(),
			milestoneId,
			projectId: null,
		});

		expect(createRes.status).toBe(201);
		expect(createRes.body.task.acceptanceCriteria).toBe("必须有完成标准");
		expect(createRes.body.task.dueDate).toBe(new Date("2026-06-01").getTime());
		expect(createRes.body.task.blockedReason).toBeNull();
		expect(createRes.body.task.sortOrder).toBeGreaterThan(0);

		const updateRes = await api
			.patch(`/api/workspace/tasks/${createRes.body.task.id}`)
			.send({
				blockedReason: "等待 API 文档",
				sortOrder: 42,
				actor: "user",
			});

		expect(updateRes.status).toBe(200);
		expect(updateRes.body.task.blockedReason).toBe("等待 API 文档");
		expect(updateRes.body.task.sortOrder).toBe(42);
	});

	it("rejects deleting a milestone that still has tasks", async () => {
		const milestoneRes = await api.post("/api/workspace/milestones").send({
			title: "不可删除",
			goal: "已有任务",
			acceptanceCriteria: "删除被拒绝",
		});
		await api.post("/api/workspace/tasks").send({
			title: "占用里程碑",
			priority: "normal",
			acceptanceCriteria: "存在即可",
			milestoneId: milestoneRes.body.milestone.id,
		});

		const res = await api.delete(
			`/api/workspace/milestones/${milestoneRes.body.milestone.id}`,
		);

		expect(res.status).toBe(409);
	});

	it("creates and updates milestone with projectId", async () => {
		const createRes = await api.post("/api/workspace/milestones").send({
			title: "项目里程碑",
			goal: "目标",
			acceptanceCriteria: "标准",
			projectId: "project-milestone",
		});

		expect(createRes.status).toBe(201);
		expect(createRes.body.milestone.projectId).toBe("project-milestone");

		const updateRes = await api
			.patch(`/api/workspace/milestones/${createRes.body.milestone.id}`)
			.send({ projectId: null, actor: "user" });

		expect(updateRes.status).toBe(200);
		expect(updateRes.body.milestone.projectId).toBeNull();
	});

	it("rejects forking a task processing session via POST /api/sessions", async () => {
		// 创建一个任务并直接写入 processing_session_id 来模拟已有处理会话
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "分叉禁止任务",
			priority: "normal",
			acceptanceCriteria: "禁止分叉",
		});
		const taskId = taskRes.body.task.id;
		const fakeSessionId = `session-task-${taskId}`;

		// 直接通过 DB 写入 processing_session_id
		const db = await getRidgeDb();
		db.prepare(
			`UPDATE workspace_tasks SET processing_session_id = ? WHERE task_id = ?`,
		).run(fakeSessionId, taskId);

		// 验证写入成功
		const row = db.prepare(
			`SELECT processing_session_id FROM workspace_tasks WHERE task_id = ?`,
		).get(taskId) as { processing_session_id: string } | undefined;
		expect(row?.processing_session_id).toBe(fakeSessionId);

		// 尝试分叉该会话
		const forkRes = await api.post("/api/sessions").send({
			parentSessionId: fakeSessionId,
			cwd: WORKSPACE,
		});

		// eslint-disable-next-line no-console
		if (forkRes.status !== 409) console.log("forkRes", forkRes.status, forkRes.text);

		expect(forkRes.status).toBe(409);
		expect(forkRes.text).toContain("任务处理会话不允许分叉");
	});

	it("allows normal session fork when parent is not a task processing session", async () => {
		// 先创建一个普通会话
		const sessionRes = await api.post("/api/sessions").send({
			cwd: WORKSPACE,
			title: "普通会话",
		});
		// 注意：如果没有可用的模型，创建会话可能 500；这里主要验证守卫逻辑本身
		// 当环境不支持创建真实会话时，只要不是因为"任务处理会话不允许分叉"而失败即可
		if (sessionRes.status === 500) {
			// 由于模型缺失导致 500，跳过分叉测试
			expect(sessionRes.text).not.toContain("任务处理会话不允许分叉");
			return;
		}
		expect(sessionRes.status).toBe(201);
		const sessionId = sessionRes.body.id;

		// 尝试分叉普通会话
		const forkRes = await api.post("/api/sessions").send({
			parentSessionId: sessionId,
			cwd: WORKSPACE,
		});

		if (forkRes.status === 500) {
			expect(forkRes.text).not.toContain("任务处理会话不允许分叉");
			return;
		}
		expect(forkRes.status).toBe(201);
	}, 20000);

	it("POST /api/sessions still rejects task-agent for normal sessions", async () => {
		// 普通会话选择 task-agent 应该被拒绝
		const sessionRes = await api.post("/api/sessions").send({
			cwd: WORKSPACE,
			title: "普通会话选task-agent",
			agent: "task-agent",
		});

		// 可能 400 或 500（取决于模型环境），但绝不能 201
		expect(sessionRes.status).not.toBe(201);
		if (sessionRes.status === 400 || sessionRes.status === 500) {
			expect(sessionRes.text).toContain("task");
		}
	});

	it("PATCH /api/sessions/:sessionId rejects switching a task processing session to a normal agent", async () => {
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "PATCH 边界任务",
			priority: "normal",
			acceptanceCriteria: "任务会话不能切换普通 Agent",
		});
		expect(taskRes.status).toBe(201);
		const sessionId = await bindTaskProcessingSession(taskRes.body.task.id);

		const patchRes = await api
			.patch(`/api/sessions/${sessionId}`)
			.send({ agent: "general-agent" });

		expect(patchRes.status).toBe(400);
		expect(patchRes.text).toContain("任务处理会话只能使用 task-agent");
	});

	it("POST /api/sessions/:sessionId/messages rejects a normal agent on task processing sessions", async () => {
		const taskRes = await api.post("/api/workspace/tasks").send({
			title: "消息边界任务",
			priority: "normal",
			acceptanceCriteria: "任务会话消息不能切换普通 Agent",
		});
		expect(taskRes.status).toBe(201);
		const sessionId = await bindTaskProcessingSession(taskRes.body.task.id);

		const messageRes = await api
			.post(`/api/sessions/${sessionId}/messages`)
			.send({ prompt: "继续处理", agent: "general-agent" });

		expect(messageRes.status).toBe(400);
		expect(messageRes.text).toContain("任务处理会话只能使用 task-agent");
	});
});
