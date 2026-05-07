import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWorkspaceTasksRouter } from "../routes/workspace-tasks.js";
import { createTempDir } from "../test/helpers.js";

const createApp = (workspaceDir: string) => {
	const app = express();
	app.use(express.json());
	app.use("/api/workspace/tasks", createWorkspaceTasksRouter(workspaceDir));
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
		cleanup = () => fs.rm(workspaceDir, { recursive: true, force: true });
	});

	afterEach(async () => {
		await cleanup();
	});

	it("persists optional goal metadata on create and update through workspace DB", async () => {
		const app = createApp(workspaceDir);

		const createResponse = await request(app)
			.post("/api/workspace/tasks")
			.send({
				title: "整理 pi_web MVP",
				kind: "goal",
				source: "dashboard",
			})
			.expect(201);

		expect(createResponse.body.task).toMatchObject({
			title: "整理 pi_web MVP",
			kind: "goal",
			source: "dashboard",
		});
		await expect(pathExists(path.join(workspaceDir, ".ridge", "ridge.db"))).resolves.toBe(true);
		await expect(pathExists(path.join(workspaceDir, ".ridge", "tasks.json"))).resolves.toBe(false);

		await request(app)
			.patch(`/api/workspace/tasks/${createResponse.body.task.id}`)
			.send({
				sessionId: "session-123",
				_expectedUpdatedAt: createResponse.body.updatedAt,
			})
			.expect(200);

		const listResponse = await request(app).get("/api/workspace/tasks").expect(200);
		expect(listResponse.body.tasks[0]).toMatchObject({
			kind: "goal",
			source: "dashboard",
			sessionId: "session-123",
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

		expect(listResponse.body).toEqual({ tasks: [], updatedAt: 0 });
		await expect(pathExists(filePath)).resolves.toBe(true);
	});

	it("isolates tasks by workspace DB", async () => {
		const otherWorkspaceDir = await createTempDir("ridge-workspace-tasks-other-");
		try {
			await request(createApp(workspaceDir))
				.post("/api/workspace/tasks")
				.send({ title: "工作区 A" })
				.expect(201);
			await request(createApp(otherWorkspaceDir))
				.post("/api/workspace/tasks")
				.send({ title: "工作区 B" })
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

	it("returns an error response when workspace DB is corrupted", async () => {
		const dbPath = path.join(workspaceDir, ".ridge", "ridge.db");
		await fs.mkdir(path.dirname(dbPath), { recursive: true });
		await fs.writeFile(dbPath, "not a sqlite database", "utf-8");

		const response = await request(createApp(workspaceDir))
			.get("/api/workspace/tasks")
			.expect(500);

		expect(response.body.error).toBeTruthy();
	});
});
