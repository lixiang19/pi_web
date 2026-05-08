import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceTasksRouter } from "../routes/workspace-tasks.js";
import { createTempDir } from "../test/helpers.js";

const BASE_PATH = "/api/workspace/tasks";

interface TaskItem {
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done";
	priority: "low" | "medium" | "high";
	dueDate: number | null;
	tags: string[];
	createdAt: number;
	updatedAt: number;
}

describe("workspace-tasks API", () => {
	let workspaceDir: string;
	let cleanup: () => Promise<void>;

	const createApp = () => {
		const app = express();
		app.use(express.json());
		app.use(BASE_PATH, createWorkspaceTasksRouter(workspaceDir));
		return app;
	};

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-wt-");
		cleanup = () => fs.rm(workspaceDir, { recursive: true, force: true });
	});

	afterEach(async () => {
		await cleanup();
	});

	// ===== CRUD 基础 =====

	it("GET / → 空列表返回空数组", async () => {
		const app = createApp();
		const res = await request(app).get(BASE_PATH);
		expect(res.status).toBe(200);
		expect(res.body.tasks).toEqual([]);
		expect(typeof res.body.updatedAt).toBe("number");
	});

	it("POST / → 创建任务，返回完整 TaskItem", async () => {
		const app = createApp();
		const res = await request(app).post(BASE_PATH).send({ title: "Test task" });
		expect(res.status).toBe(201);
		expect(res.body.task).toMatchObject({
			title: "Test task",
			status: "pending",
			priority: "medium",
			dueDate: null,
			tags: [],
		});
		expect(typeof res.body.task.id).toBe("string");
		expect(res.body.task.id).toMatch(/^task-/);
		expect(typeof res.body.task.createdAt).toBe("number");
		expect(typeof res.body.task.updatedAt).toBe("number");
		expect(typeof res.body.updatedAt).toBe("number");
	});

	it("POST / → 缺少 title 返回 400", async () => {
		const app = createApp();
		const res = await request(app).post(BASE_PATH).send({});
		expect(res.status).toBe(400);
	});

	it("PATCH /:taskId → 更新指定字段", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "My task" });
		const { id } = createRes.body.task;

		const patchRes = await request(app).patch(`${BASE_PATH}/${id}`).send({
			status: "done",
			priority: "high",
			title: "Updated task",
			_expectedUpdatedAt: createRes.body.updatedAt,
		});
		expect(patchRes.status).toBe(200);
		expect(patchRes.body.ok).toBe(true);
		expect(typeof patchRes.body.updatedAt).toBe("number");

		// Verify by reading back
		const getRes = await request(app).get(BASE_PATH);
		const updatedTask = getRes.body.tasks.find((t: TaskItem) => t.id === id);
		expect(updatedTask).toBeDefined();
		expect(updatedTask!.status).toBe("done");
		expect(updatedTask!.priority).toBe("high");
		expect(updatedTask!.title).toBe("Updated task");
	});

	it("PATCH /:taskId → 不存在的 taskId 返回 404", async () => {
		const app = createApp();
		const res = await request(app)
			.patch(`${BASE_PATH}/nonexistent-id`)
			.send({ title: "updated" });
		expect(res.status).toBe(404);
	});

	it("DELETE /:taskId → 删除成功", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Delete me" });
		const { id } = createRes.body.task;

		const delRes = await request(app)
			.delete(`${BASE_PATH}/${id}`)
			.send({ _expectedUpdatedAt: createRes.body.updatedAt });
		expect(delRes.status).toBe(200);
		expect(delRes.body.ok).toBe(true);

		const getRes = await request(app).get(BASE_PATH);
		expect(
			getRes.body.tasks.find((t: TaskItem) => t.id === id),
		).toBeUndefined();
	});

	it("DELETE /:taskId → 不存在的 taskId 返回 404", async () => {
		const app = createApp();
		const res = await request(app)
			.delete(`${BASE_PATH}/nonexistent-id`)
			.send({});
		expect(res.status).toBe(404);
	});

	// ===== 乐观锁 =====

	it("PATCH /:taskId → updatedAt 不匹配返回 409", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Optimistic lock" });
		const { id } = createRes.body.task;

		const res = await request(app)
			.patch(`${BASE_PATH}/${id}`)
			.send({ status: "done", _expectedUpdatedAt: 0 });
		expect(res.status).toBe(409);
	});

	it("DELETE /:taskId → updatedAt 不匹配返回 409", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Optimistic lock delete" });
		const { id } = createRes.body.task;

		const res = await request(app)
			.delete(`${BASE_PATH}/${id}`)
			.send({ _expectedUpdatedAt: 0 });
		expect(res.status).toBe(409);
	});

	it("409 后重新 GET 能拿到最新数据", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Latest data" });
		const { id } = createRes.body.task;

		// First successful update
		await request(app).patch(`${BASE_PATH}/${id}`).send({
			status: "done",
			_expectedUpdatedAt: createRes.body.updatedAt,
		});

		// Try with stale updatedAt → 409
		const staleRes = await request(app).patch(`${BASE_PATH}/${id}`).send({
			status: "pending",
			_expectedUpdatedAt: createRes.body.updatedAt,
		});
		expect(staleRes.status).toBe(409);

		// GET still works and returns latest data
		const getRes = await request(app).get(BASE_PATH);
		expect(getRes.status).toBe(200);
		const task = getRes.body.tasks.find((t: TaskItem) => t.id === id);
		expect(task).toBeDefined();
		expect(task!.status).toBe("done");
	});

	// ===== 持久化 =====

	it("创建任务后 tasks.json 文件存在且内容正确", async () => {
		const app = createApp();
		await request(app).post(BASE_PATH).send({ title: "Disk task" });

		const filePath = path.join(workspaceDir, ".ridge", "tasks.json");
		const content = await fs.readFile(filePath, "utf-8");
		const data = JSON.parse(content);
		expect(data.tasks).toHaveLength(1);
		expect(data.tasks[0].title).toBe("Disk task");
		expect(typeof data.updatedAt).toBe("number");
	});

	it("重启（重新创建 router）后数据仍存在", async () => {
		const app1 = createApp();
		await request(app1).post(BASE_PATH).send({ title: "Persistent task" });

		// New router instance (simulates server restart)
		const app2 = createApp();
		const res = await request(app2).get(BASE_PATH);
		expect(res.status).toBe(200);
		expect(res.body.tasks).toHaveLength(1);
		expect(res.body.tasks[0].title).toBe("Persistent task");
	});

	// ===== 边界 =====

	it("并发更新同一任务，先到的成功，后到的 409", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Concurrent" });
		const { id } = createRes.body.task;
		const originalUpdatedAt = createRes.body.updatedAt;

		// First update (succeeds)
		const first = await request(app)
			.patch(`${BASE_PATH}/${id}`)
			.send({ status: "done", _expectedUpdatedAt: originalUpdatedAt });
		expect(first.status).toBe(200);

		// Second update with stale updatedAt (409)
		const second = await request(app)
			.patch(`${BASE_PATH}/${id}`)
			.send({ status: "pending", _expectedUpdatedAt: originalUpdatedAt });
		expect(second.status).toBe(409);
	});

	it("tasks.json 不存在时 GET 返回空数据", async () => {
		const app = createApp();
		const res = await request(app).get(BASE_PATH);
		expect(res.status).toBe(200);
		expect(res.body.tasks).toEqual([]);
		expect(typeof res.body.updatedAt).toBe("number");

		// Verify no file was created
		const filePath = path.join(workspaceDir, ".ridge", "tasks.json");
		await expect(fs.access(filePath)).rejects.toThrow();
	});

	// ===== Reorder API =====

	it("PATCH /reorder → 批量更新 order 成功", async () => {
		const app = createApp();
		const t1 = await request(app).post(BASE_PATH).send({ title: "Task 1" });
		const t2 = await request(app).post(BASE_PATH).send({ title: "Task 2" });
		const t3 = await request(app).post(BASE_PATH).send({ title: "Task 3" });

		const items = [
			{ id: t1.body.task.id, order: 2 },
			{ id: t2.body.task.id, order: 0 },
			{ id: t3.body.task.id, order: 1 },
		];

		const res = await request(app)
			.patch(`${BASE_PATH}/reorder`)
			.send({ items, _expectedUpdatedAt: t3.body.updatedAt });
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(typeof res.body.updatedAt).toBe("number");

		// Verify order was persisted
		const getRes = await request(app).get(BASE_PATH);
		const tasks = getRes.body.tasks;
		const sorted = [...tasks].sort((a: any, b: any) => a.order - b.order);
		expect(sorted[0].title).toBe("Task 2");
		expect(sorted[1].title).toBe("Task 3");
		expect(sorted[2].title).toBe("Task 1");
	});

	it("PATCH /reorder → 更新 status 和 order", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Move me" });
		const { id } = createRes.body.task;

		const res = await request(app)
			.patch(`${BASE_PATH}/reorder`)
			.send({
				items: [{ id, order: 0, status: "in_progress" }],
				_expectedUpdatedAt: createRes.body.updatedAt,
			});
		expect(res.status).toBe(200);

		const getRes = await request(app).get(BASE_PATH);
		const task = getRes.body.tasks.find((t: any) => t.id === id);
		expect(task.status).toBe("in_progress");
		expect(task.order).toBe(0);
	});

	it("PATCH /reorder → 不存在的任务 ID 返回 404", async () => {
		const app = createApp();
		const res = await request(app)
			.patch(`${BASE_PATH}/reorder`)
			.send({ items: [{ id: "nonexistent", order: 0 }] });
		expect(res.status).toBe(404);
	});

	it("PATCH /reorder → items 为空数组返回 400", async () => {
		const app = createApp();
		const res = await request(app)
			.patch(`${BASE_PATH}/reorder`)
			.send({ items: [] });
		expect(res.status).toBe(400);
	});

	it("PATCH /reorder → updatedAt 不匹配返回 409", async () => {
		const app = createApp();
		const createRes = await request(app)
			.post(BASE_PATH)
			.send({ title: "Lock test" });
		const { id } = createRes.body.task;

		const res = await request(app)
			.patch(`${BASE_PATH}/reorder`)
			.send({ items: [{ id, order: 0 }], _expectedUpdatedAt: 0 });
		expect(res.status).toBe(409);
	});
});
