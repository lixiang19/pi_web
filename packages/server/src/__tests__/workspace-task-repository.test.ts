import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SqliteTaskRepository } from "../repositories/workspace-task-repository.js";

async function createTempDir(prefix: string) {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function pathExists(targetPath: string) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

describe("SqliteTaskRepository", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("initializes workspace ridge.db and does not create tasks.json", async () => {
		const workspaceDir = await createTempDir("ridge-task-repo-empty-");
		const repository = new SqliteTaskRepository(workspaceDir);

		await expect(repository.list()).resolves.toEqual({ tasks: [], updatedAt: 0 });
		await expect(pathExists(path.join(workspaceDir, ".ridge", "ridge.db"))).resolves.toBe(true);
		await expect(pathExists(path.join(workspaceDir, ".ridge", "tasks.json"))).resolves.toBe(false);
	});

	it("creates and updates tasks in SQLite while preserving API task shape", async () => {
		const workspaceDir = await createTempDir("ridge-task-repo-crud-");
		const repository = new SqliteTaskRepository(workspaceDir);

		const created = await repository.create({
			title: "整理任务存储",
			priority: "high",
			dueDate: 1714521600000,
			tags: ["task", "db"],
			kind: "goal",
			sessionId: "session-1",
			source: "dashboard",
		});

		expect(created.task).toMatchObject({
			title: "整理任务存储",
			status: "pending",
			priority: "high",
			dueDate: 1714521600000,
			tags: ["task", "db"],
			kind: "goal",
			sessionId: "session-1",
			source: "dashboard",
		});

		const updated = await repository.update(
			created.task.id,
			{
				status: "in_progress",
				title: "抽 TaskRepository",
				priority: "medium",
				dueDate: null,
				tags: ["server"],
				sessionId: "",
			},
			created.updatedAt,
		);

		expect(updated.task).toMatchObject({
			title: "抽 TaskRepository",
			status: "in_progress",
			priority: "medium",
			dueDate: null,
			tags: ["server"],
		});
		expect(updated.task).not.toHaveProperty("sessionId");
		await expect(pathExists(path.join(workspaceDir, ".ridge", "tasks.json"))).resolves.toBe(false);
	});

	it("rejects writes when expectedUpdatedAt is stale", async () => {
		const workspaceDir = await createTempDir("ridge-task-repo-lock-");
		const repository = new SqliteTaskRepository(workspaceDir);
		const created = await repository.create({ title: "先创建" });

		await expect(
			repository.update(created.task.id, { title: "过期写入" }, created.updatedAt - 1),
		).rejects.toMatchObject({ statusCode: 409 });

		const current = await repository.list();
		expect(current.tasks[0]?.title).toBe("先创建");
	});

	it("increments optimistic lock versions when writes happen in the same millisecond", async () => {
		vi.spyOn(Date, "now").mockReturnValue(1714521600000);
		const workspaceDir = await createTempDir("ridge-task-repo-monotonic-");
		const repository = new SqliteTaskRepository(workspaceDir);

		const first = await repository.create({ title: "第一次" });
		const second = await repository.create({ title: "第二次" }, first.updatedAt);

		expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
		await expect(
			repository.update(second.task.id, { title: "旧版本写入" }, first.updatedAt),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it("deletes tasks from SQLite", async () => {
		const workspaceDir = await createTempDir("ridge-task-repo-delete-");
		const repository = new SqliteTaskRepository(workspaceDir);
		const created = await repository.create({ title: "待删除" });

		await repository.delete(created.task.id, created.updatedAt);

		const current = await repository.list();
		expect(current.tasks).toEqual([]);
	});
});
