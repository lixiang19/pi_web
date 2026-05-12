import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWorkspaceTasksRouter, createWorkspaceMilestonesRouter, type WorkspaceTasksRouterDeps } from "../routes/workspace-tasks.js";
import { createTempDir } from "../test/helpers.js";
import { getRidgeDb } from "../db/index.js";
import type { SessionRecord, SessionSnapshot, ThinkingLevel } from "../types/index.js";

const createMockDeps = (): WorkspaceTasksRouterDeps => ({
	createSessionRecord: vi.fn(async (params) => ({
		id: `session-${Date.now()}`,
		cwd: params.cwd,
		sessionFile: `/tmp/session-${Date.now()}.json`,
		status: "idle",
		createdAt: Date.now(),
		updatedAt: Date.now(),
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
		title: "测试会话",
		cwd: record.cwd,
		status: "idle",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		archived: false,
		messages: [],
		historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
		interactiveRequests: [],
		permissionRequests: [],
	} as unknown as SessionSnapshot)),
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
	workspaceChatConfig: { workspaceDir: "/tmp/workspace", chatProjectId: "test-project", chatProjectPath: "/tmp/workspace", chatProjectLabel: "Test" },
});

const createApp = (workspaceDir: string, deps?: WorkspaceTasksRouterDeps) => {
	const app = express();
	app.use(express.json());
	app.use("/api/workspace/tasks", createWorkspaceTasksRouter(workspaceDir, deps));
	app.use("/api/workspace/milestones", createWorkspaceMilestonesRouter(workspaceDir));
	app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
		res.status(err.statusCode ?? 500).json({ error: err.message });
	});
	return app;
};

async function pathExists(targetPath: string) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

describe("workspace tasks api", () => {
	let workspaceDir = "";
	let cleanup: () => Promise<void> = async () => undefined;

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-workspace-tasks-");
		const db = await getRidgeDb();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
		cleanup = () => fs.rm(workspaceDir, { recursive: true, force: true });
	});

	afterEach(async () => {
		await cleanup();
	});

	it("persists task data on create and update through the workspace task API", async () => {
		const app = createApp(workspaceDir);

		const createResponse = await request(app)
			.post("/api/workspace/tasks")
			.send({
				title: "整理 pi_web MVP",
				priority: "important",
				acceptanceCriteria: "任务可以创建和更新",
			})
			.expect(201);

		expect(createResponse.body.task).toMatchObject({
			title: "整理 pi_web MVP",
			priority: "important",
			acceptanceCriteria: "任务可以创建和更新",
		});
		await expect(pathExists(path.join(workspaceDir, ".ridge", "tasks.json"))).resolves.toBe(false);

		// 测试更新 blockedReason（processingSessionId 不再允许通过 PATCH 直接更新）
		await request(app)
			.patch(`/api/workspace/tasks/${createResponse.body.task.id}`)
			.send({
				blockedReason: "等待资源",
			})
			.expect(200);

		const listResponse = await request(app).get("/api/workspace/tasks").expect(200);
		expect(listResponse.body.tasks[0]).toMatchObject({
			title: "整理 pi_web MVP",
			blockedReason: "等待资源",
		});
	});

	it("does not read or import legacy .ridge/tasks.json", async () => {
		const filePath = path.join(workspaceDir, ".ridge", "tasks.json");
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(
			filePath,
			JSON.stringify({
				updatedAt: 1,
				tasks: [
					{
						id: "task-legacy",
						title: "旧任务",
						status: "pending",
						priority: "medium",
						dueDate: null,
						tags: [],
						createdAt: 1,
						updatedAt: 1,
					},
				],
			}),
			"utf-8",
		);

		const listResponse = await request(createApp(workspaceDir))
			.get("/api/workspace/tasks")
			.expect(200);

		expect(listResponse.body).toEqual({ tasks: [] });
		await expect(pathExists(filePath)).resolves.toBe(true);
	});

	it("isolates tasks by workspace DB", async () => {
		const otherWorkspaceDir = await createTempDir("ridge-workspace-tasks-other-");
		try {
			await request(createApp(workspaceDir))
				.post("/api/workspace/tasks")
				.send({
					title: "工作区 A",
					priority: "normal",
					acceptanceCriteria: "只属于工作区 A",
				})
				.expect(201);
			await request(createApp(otherWorkspaceDir))
				.post("/api/workspace/tasks")
				.send({
					title: "工作区 B",
					priority: "normal",
					acceptanceCriteria: "只属于工作区 B",
				})
				.expect(201);

			const first = await request(createApp(workspaceDir)).get("/api/workspace/tasks").expect(200);
			const second = await request(createApp(otherWorkspaceDir)).get("/api/workspace/tasks").expect(200);

			expect(first.body.tasks).toHaveLength(1);
			expect(first.body.tasks[0].title).toBe("工作区 A");
			expect(second.body.tasks).toHaveLength(1);
			expect(second.body.tasks[0].title).toBe("工作区 B");
		} finally {
			await fs.rm(otherWorkspaceDir, { recursive: true, force: true });
		}
	});

	it("inherits projectId from milestone when creating a task without explicit projectId", async () => {
		const app = createApp(workspaceDir);

		// Create milestone with projectId
		const milestoneRes = await request(app)
			.post("/api/workspace/milestones")
			.send({
				title: "里程碑 A",
				goal: "目标",
				acceptanceCriteria: "标准",
				projectId: "project-alpha",
			})
			.expect(201);
		const milestoneId = milestoneRes.body.milestone.id;

		// Create task without projectId
		const taskRes = await request(app)
			.post("/api/workspace/tasks")
			.send({
				title: "继承项目任务",
				priority: "normal",
				acceptanceCriteria: "标准",
				milestoneId,
			})
			.expect(201);

		expect(taskRes.body.task.projectId).toBe("project-alpha");
	});

	it("filters tasks by projectId=none and specific projectId", async () => {
		const app = createApp(workspaceDir);

		// Create two milestones
		const m1 = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M1", goal: "g", acceptanceCriteria: "a", projectId: "p1" })
			.expect(201);
		const m2 = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M2", goal: "g", acceptanceCriteria: "a" })
			.expect(201);

		await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "T1", priority: "normal", acceptanceCriteria: "a", milestoneId: m1.body.milestone.id })
			.expect(201);
		await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "T2", priority: "normal", acceptanceCriteria: "a", milestoneId: m2.body.milestone.id })
			.expect(201);

		const all = await request(app).get("/api/workspace/tasks").expect(200);
		expect(all.body.tasks).toHaveLength(2);

		const none = await request(app).get("/api/workspace/tasks?projectId=none").expect(200);
		expect(none.body.tasks.map((t: { title: string }) => t.title)).toEqual(["T2"]);

		const p1 = await request(app).get("/api/workspace/tasks?projectId=p1").expect(200);
		expect(p1.body.tasks.map((t: { title: string }) => t.title)).toEqual(["T1"]);
	});
});

describe("workspace tasks processing session api", () => {
	let workspaceDir = "";
	let cleanup: () => Promise<void> = async () => undefined;

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-workspace-tasks-ps-");
		const db = await getRidgeDb();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
		cleanup = () => fs.rm(workspaceDir, { recursive: true, force: true });
	});

	afterEach(async () => {
		await cleanup();
	});

	it("GET /:taskId/processing-session returns 404 when no session exists", async () => {
		const app = createApp(workspaceDir, createMockDeps());

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "无会话任务", priority: "normal", acceptanceCriteria: "标准" })
			.expect(201);

		await request(app)
			.get(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(404);
	});

	it("POST creates processing session and records processing_session_id", async () => {
		const deps = createMockDeps();
		const app = createApp(workspaceDir, deps);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "创建会话任务", priority: "normal", acceptanceCriteria: "标准" })
			.expect(201);
		const taskId = createRes.body.task.id;

		const psRes = await request(app)
			.post(`/api/workspace/tasks/${taskId}/processing-session`)
			.expect(201);

		expect(psRes.body.created).toBe(true);
		expect(psRes.body.sessionId).toBeTruthy();

		// 再次 GET 应返回 sessionId
		const getRes = await request(app)
			.get(`/api/workspace/tasks/${taskId}/processing-session`)
			.expect(200);
		expect(getRes.body.sessionId).toBe(psRes.body.sessionId);

		// 重复 POST 只返回已有会话
		const psRes2 = await request(app)
			.post(`/api/workspace/tasks/${taskId}/processing-session`)
			.expect(200);
		expect(psRes2.body.created).toBe(false);
		expect(psRes2.body.sessionId).toBe(psRes.body.sessionId);
	});

	it("POST creates project session when task has projectId", async () => {
		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => ({
			projects: [{ id: "proj-1", path: "/projects/alpha", deviceId: undefined, isOnline: false }],
		}));

		const app = createApp(workspaceDir, deps);

		const msRes = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M", goal: "g", acceptanceCriteria: "a", projectId: "proj-1" })
			.expect(201);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "项目任务", priority: "normal", acceptanceCriteria: "标准", milestoneId: msRes.body.milestone.id })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(201);

		expect(deps.createSessionRecord).toHaveBeenCalledWith(
			expect.objectContaining({ cwd: "/projects/alpha" }),
		);
	});

	it("POST rejects when bound project is offline (has deviceId and isOnline=false)", async () => {
		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => ({
			projects: [{ id: "proj-offline", path: "/projects/offline", deviceId: "device-1", isOnline: false }],
		}));

		const app = createApp(workspaceDir, deps);

		const msRes = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M", goal: "g", acceptanceCriteria: "a", projectId: "proj-offline" })
			.expect(201);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "离线项目任务", priority: "normal", acceptanceCriteria: "标准", milestoneId: msRes.body.milestone.id })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(409);
	});

	it("POST allows local server-folder project without deviceId even if isOnline=false", async () => {
		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => ({
			projects: [{ id: "proj-local", path: "/projects/local", deviceId: undefined, isOnline: false }],
		}));

		const app = createApp(workspaceDir, deps);

		const msRes = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M", goal: "g", acceptanceCriteria: "a", projectId: "proj-local" })
			.expect(201);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "本地项目任务", priority: "normal", acceptanceCriteria: "标准", milestoneId: msRes.body.milestone.id })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(201);
	});

	it("POST rejects when projectId does not exist", async () => {
		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => ({ projects: [] }));

		const app = createApp(workspaceDir, deps);

		const msRes = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M", goal: "g", acceptanceCriteria: "a", projectId: "nonexistent" })
			.expect(201);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "未知项目任务", priority: "normal", acceptanceCriteria: "标准", milestoneId: msRes.body.milestone.id })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(404);
	});

	it("POST uses defaultWorkspaceDir when task has no projectId", async () => {
		const deps = createMockDeps();
		const app = createApp(workspaceDir, deps);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "无项目任务", priority: "normal", acceptanceCriteria: "标准" })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(201);

		expect(deps.createSessionRecord).toHaveBeenCalledWith(
			expect.objectContaining({ cwd: workspaceDir }),
		);
	});

	it("POST does not override existing different processing_session_id", async () => {
		const deps = createMockDeps();
		const app = createApp(workspaceDir, deps);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "不覆盖任务", priority: "normal", acceptanceCriteria: "标准" })
			.expect(201);

		// 直接 DB 写入一个已有 sessionId
		const db = await getRidgeDb();
		const existingSessionId = `session-existing-${createRes.body.task.id}`;
		db.prepare(
			`UPDATE workspace_tasks SET processing_session_id = ? WHERE task_id = ?`,
		).run(existingSessionId, createRes.body.task.id);

		// POST 应该返回已有的 sessionId，不创建新会话
		const psRes = await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(200);

		expect(psRes.body.created).toBe(false);
		expect(psRes.body.sessionId).toBe(existingSessionId);
		expect(deps.createSessionRecord).toHaveBeenCalledTimes(0);
	});

	it("POST forces task-agent selection via applyTaskSessionAgentSelection", async () => {
		const deps = createMockDeps();
		const app = createApp(workspaceDir, deps);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "强制Agent任务", priority: "normal", acceptanceCriteria: "标准" })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(201);

		expect(deps.applyTaskSessionAgentSelection).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ agentName: "task-agent" }),
		);
	});

	it("POST returns 409 when project is offline even if task already has processingSessionId", async () => {
		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => ({
			projects: [{ id: "proj-offline", path: "/projects/offline", deviceId: "device-1", isOnline: false }],
		}));

		const app = createApp(workspaceDir, deps);

		const msRes = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M", goal: "g", acceptanceCriteria: "a", projectId: "proj-offline" })
			.expect(201);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "离线已有会话任务", priority: "normal", acceptanceCriteria: "标准", milestoneId: msRes.body.milestone.id })
			.expect(201);

		// 直接 DB 写入 processing_session_id 来模拟已有处理会话
		const db = await getRidgeDb();
		const fakeSessionId = `session-existing-${createRes.body.task.id}`;
		db.prepare(
			`UPDATE workspace_tasks SET processing_session_id = ? WHERE task_id = ?`,
		).run(fakeSessionId, createRes.body.task.id);

		// POST 应该仍然 409，因为项目离线
		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(409);
	});

	it("GET returns 409 when project is offline and task has processingSessionId", async () => {
		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => ({
			projects: [{ id: "proj-offline", path: "/projects/offline", deviceId: "device-1", isOnline: false }],
		}));

		const app = createApp(workspaceDir, deps);

		const msRes = await request(app)
			.post("/api/workspace/milestones")
			.send({ title: "M", goal: "g", acceptanceCriteria: "a", projectId: "proj-offline" })
			.expect(201);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "离线已有会话任务", priority: "normal", acceptanceCriteria: "标准", milestoneId: msRes.body.milestone.id })
			.expect(201);

		// 直接 DB 写入 processing_session_id
		const db = await getRidgeDb();
		const fakeSessionId = `session-existing-${createRes.body.task.id}`;
		db.prepare(
			`UPDATE workspace_tasks SET processing_session_id = ? WHERE task_id = ?`,
		).run(fakeSessionId, createRes.body.task.id);

		// GET 应该 409
		await request(app)
			.get(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(409);
	});

	it("POST uses real projectContextResolver and workspaceChatConfig types", async () => {
		const deps = createMockDeps();
		const app = createApp(workspaceDir, deps);

		const createRes = await request(app)
			.post("/api/workspace/tasks")
			.send({ title: "真实依赖任务", priority: "normal", acceptanceCriteria: "标准" })
			.expect(201);

		await request(app)
			.post(`/api/workspace/tasks/${createRes.body.task.id}/processing-session`)
			.expect(201);

		expect(deps.upsertIndexedSessionRecord).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				projectContextResolver: deps.projectContextResolver,
				workspaceChatConfig: deps.workspaceChatConfig,
			}),
		);
	});
});
