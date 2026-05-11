import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWorkspaceTasksRouter, createWorkspaceMilestonesRouter } from "../routes/workspace-tasks.js";
import { createTempDir } from "../test/helpers.js";
import { getRidgeDb } from "../db/index.js";

const createApp = (workspaceDir: string) => {
	const app = express();
	app.use(express.json());
	app.use("/api/workspace/tasks", createWorkspaceTasksRouter(workspaceDir));
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

		await request(app)
			.patch(`/api/workspace/tasks/${createResponse.body.task.id}`)
			.send({
				processingSessionId: "session-123",
			})
			.expect(200);

		const listResponse = await request(app).get("/api/workspace/tasks").expect(200);
		expect(listResponse.body.tasks[0]).toMatchObject({
			title: "整理 pi_web MVP",
			processingSessionId: "session-123",
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
