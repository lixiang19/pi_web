import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { app } from "../index.js";
import { getRidgeDb } from "../db/index.js";
import { createTask, getTask } from "../task-system.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

async function clearTask54State() {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM session_index WHERE session_id LIKE 'task54-%' OR title LIKE 'task54%' OR task_id IN (SELECT task_id FROM workspace_tasks WHERE title LIKE 'task54%')").run();
	db.prepare("DELETE FROM sessions WHERE session_id LIKE 'task54-%' OR title LIKE 'task54%'").run();
	db.prepare("DELETE FROM workspace_tasks WHERE title LIKE 'task54%'").run();
	db.prepare("DELETE FROM devices WHERE device_id LIKE 'android-task54%'").run();
}

async function registerAndroidDevice(deviceId = "android-task54") {
	const res = await request(app).post("/api/devices/register").send({
		deviceId,
		name: "Pixel",
		deviceType: "android",
		capabilities: { mobile_capture: true, camera: true, microphone: true },
	});
	expect(res.status).toBe(201);
	return {
		deviceId: String(res.body.deviceId),
		token: String(res.body.token),
	};
}

describe("Task 54 - Android task viewing and light actions", () => {
	afterEach(async () => {
		await clearTask54State();
	});

	it("lets Android token read existing tasks and project summaries", async () => {
		const registration = await registerAndroidDevice("android-task54-read");
		const task = await createTask(WORKSPACE, {
			title: "task54 read existing task",
			priority: "important",
			acceptanceCriteria: "Android can read task list",
		});

		const tasksRes = await request(app)
			.get("/api/workspace/tasks")
			.set("Authorization", `Bearer ${registration.token}`);
		expect(tasksRes.status).toBe(200);
		expect(tasksRes.body.tasks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: task.id,
					title: "task54 read existing task",
					status: "pending",
					priority: "important",
				}),
			]),
		);

		const detailRes = await request(app)
			.get(`/api/workspace/tasks/${task.id}`)
			.set("Authorization", `Bearer ${registration.token}`);
		expect(detailRes.status).toBe(200);
		expect(detailRes.body.task).toMatchObject({ id: task.id, title: task.title });

		const projectsRes = await request(app)
			.get("/api/workspace/projects")
			.set("Authorization", `Bearer ${registration.token}`);
		expect(projectsRes.status).toBe(200);
		expect(Array.isArray(projectsRes.body.projects)).toBe(true);
	});

	it("lets Android token update only task status through the server state machine", async () => {
		const registration = await registerAndroidDevice("android-task54-status");
		const task = await createTask(WORKSPACE, {
			title: "task54 update status",
			priority: "normal",
			acceptanceCriteria: "Android can move pending to in_progress",
		});

		const okRes = await request(app)
			.patch(`/api/workspace/tasks/${task.id}`)
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ status: "in_progress", actor: "user" });
		expect(okRes.status).toBe(200);
		expect(okRes.body.task).toMatchObject({ id: task.id, status: "in_progress" });

		const illegalRes = await request(app)
			.patch(`/api/workspace/tasks/${task.id}`)
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ status: "completed", actor: "user" });
		expect(illegalRes.status).toBe(400);
		await expect(getTask(WORKSPACE, task.id)).resolves.toMatchObject({ status: "in_progress" });
	});

	it("rejects Android task mutations outside light status operations", async () => {
		const registration = await registerAndroidDevice("android-task54-boundary");
		const task = await createTask(WORKSPACE, {
			title: "task54 protected title",
			priority: "normal",
			acceptanceCriteria: "Android cannot edit task fields",
		});

		const titleRes = await request(app)
			.patch(`/api/workspace/tasks/${task.id}`)
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ title: "task54 changed by android", actor: "user" });
		expect(titleRes.status).toBe(403);
		await expect(getTask(WORKSPACE, task.id)).resolves.toMatchObject({
			title: "task54 protected title",
		});

		const deleteRes = await request(app)
			.delete(`/api/workspace/tasks/${task.id}`)
			.set("Authorization", `Bearer ${registration.token}`);
		expect(deleteRes.status).toBe(403);

		const projectMutationRes = await request(app)
			.post("/api/workspace/projects/internal")
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ name: "task54 android project" });
		expect(projectMutationRes.status).toBe(403);
	});

	it("lets Android token continue an existing task processing session", async () => {
		const registration = await registerAndroidDevice("android-task54-session");
		const task = await createTask(WORKSPACE, {
			title: "task54 processing session",
			priority: "urgent",
			acceptanceCriteria: "Android can continue a task session",
		});
		const db = await getRidgeDb();
		db.prepare("UPDATE workspace_tasks SET processing_session_id = ? WHERE task_id = ?").run(
			"task54-existing-session",
			task.id,
		);

		const sessionRes = await request(app)
			.post(`/api/workspace/tasks/${task.id}/processing-session`)
			.set("Authorization", `Bearer ${registration.token}`)
			.send({});
		expect(sessionRes.status).toBe(200);
		expect(sessionRes.body).toEqual({
			sessionId: "task54-existing-session",
			created: false,
		});
		await expect(getTask(WORKSPACE, task.id)).resolves.toMatchObject({
			processingSessionId: "task54-existing-session",
		});
	});
});
