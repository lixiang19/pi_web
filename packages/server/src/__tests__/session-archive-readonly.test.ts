import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";

let api: ReturnType<typeof request.agent>;
const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
});

describe("POST /api/sessions/:sessionId/archive", () => {
	it("archives a session tree and sets readonly=true", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-archive-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "archive-test", WORKSPACE, "", Date.now(), Date.now(), 0, 0);

		const archiveRes = await api.post(`/api/sessions/${sessionId}/archive`).send({ archived: true });
		expect(archiveRes.status).toBe(200);
		expect(archiveRes.body.ok).toBe(true);
		expect(archiveRes.body.sessionIds).toContain(sessionId);

		const row = db.prepare("SELECT archived, readonly FROM sessions WHERE session_id = ?").get(sessionId) as { archived: number; readonly: number };
		expect(row.archived).toBe(1);
		expect(row.readonly).toBe(1);
	});

	it("unarchives a session tree and restores readonly to false for normal sessions", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-unarchive-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "unarchive-test", WORKSPACE, "", Date.now(), Date.now(), 1, 1);

		const unarchiveRes = await api.post(`/api/sessions/${sessionId}/archive`).send({ archived: false });
		expect(unarchiveRes.status).toBe(200);

		const row = db.prepare("SELECT archived, readonly FROM sessions WHERE session_id = ?").get(sessionId) as { archived: number; readonly: number };
		expect(row.archived).toBe(0);
		expect(row.readonly).toBe(0);
	});
});

describe("GET /api/sessions list excludes archived", () => {
	it("does not include archived sessions in the normal list", async () => {
		const db = await getRidgeDb();
		const activeId = `session-active-${Date.now()}`;
		const archivedId = `session-archived-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(activeId, "active", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(archivedId, "archived", WORKSPACE, "", Date.now(), Date.now(), 1, 1);

		const res = await api.get("/api/sessions");
		expect(res.status).toBe(200);
		const ids = res.body.map((s: { id: string }) => s.id);
		expect(ids).toContain(activeId);
		expect(ids).not.toContain(archivedId);
	});
});

describe("POST /api/sessions/:sessionId/messages readonly guard", () => {
	it("returns 403 when sending to readonly session", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-readonly-guard-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "readonly-test", WORKSPACE, "", Date.now(), Date.now(), 0, 1);

		const msgRes = await api.post(`/api/sessions/${sessionId}/messages`).send({ prompt: "hi" });
		expect(msgRes.status).toBe(403);
	});
});

describe("POST /api/sessions fork from task session guard", () => {
	it("returns 403 when creating a session with parentSessionId pointing to a task session (taskId present)", async () => {
		const db = await getRidgeDb();
		const parentId = `session-task-parent-${Date.now()}`;
		// Simulate a task session by setting a task association via session_index
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(parentId, "task-session", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(parentId, "task-session", "task", "task", WORKSPACE, "", "task-1", "", "server", 0, 0, Date.now(), Date.now());

		const createRes = await api.post("/api/sessions").send({
			cwd: WORKSPACE,
			title: "fork",
			parentSessionId: parentId,
		});
		expect(createRes.status).toBe(403);
	});

	it("returns 403 when parent session has sessionType='task' but taskId is empty", async () => {
		const db = await getRidgeDb();
		const parentId = `session-task-type-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(parentId, "task-type-session", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(parentId, "task-type-session", "task", "task", WORKSPACE, "", "", "", "server", 0, 0, Date.now(), Date.now());

		const createRes = await api.post("/api/sessions").send({
			cwd: WORKSPACE,
			title: "fork",
			parentSessionId: parentId,
		});
		expect(createRes.status).toBe(403);
	});
});

describe("GET /api/sessions/:sessionId/hydrate offline desktop guard", () => {
	it("returns 403 when hydrating an offline desktop project session", async () => {
		const db = await getRidgeDb();
		const deviceId = `device-offline-${Date.now()}`;
		const projectId = `project-desktop-${Date.now()}`;
		const sessionId = `session-desktop-${Date.now()}`;
		const projectPath = path.join(os.homedir(), "ridge-workspace", `.desktop-${Date.now()}`);

		// Register an offline desktop device
		db.prepare(
			`INSERT INTO devices(device_id, name, device_type, status, capabilities_json, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(deviceId, "Desktop", "desktop", "offline", "{}", Date.now(), Date.now());

		// Register a desktop project with unique path
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, source, workspace_path, device_id, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(projectId, "Desktop Project", projectPath, 0, Date.now(), "external", "desktop", "", deviceId, Date.now());

		// Insert session linked to the offline device
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-session", projectPath, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-session", "project", "project", "", projectId, "", deviceId, "desktop", 0, 0, Date.now(), Date.now());

		const res = await api.get(`/api/sessions/${sessionId}/hydrate`);
		// Expect failure because the desktop device is offline and we can't read session file
		expect(res.status).toBe(403);
	});
});

describe("GET /api/sessions/:sessionId/stream offline desktop guard", () => {
	it("returns 403 when streaming an offline desktop project session", async () => {
		const db = await getRidgeDb();
		const deviceId = `device-offline-stream-${Date.now()}`;
		const projectId = `project-desktop-stream-${Date.now()}`;
		const sessionId = `session-desktop-stream-${Date.now()}`;
		const projectPath = path.join(os.homedir(), "ridge-workspace", `.desktop-stream-${Date.now()}`);

		db.prepare(
			`INSERT INTO devices(device_id, name, device_type, status, capabilities_json, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(deviceId, "Desktop", "desktop", "offline", "{}", Date.now(), Date.now());

		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, source, workspace_path, device_id, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(projectId, "Desktop Project", projectPath, 0, Date.now(), "external", "desktop", "", deviceId, Date.now());

		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-session", projectPath, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-session", "project", "project", "", projectId, "", deviceId, "desktop", 0, 0, Date.now(), Date.now());

		const res = await api.get(`/api/sessions/${sessionId}/stream`);
		expect(res.status).toBe(403);
	});
});

describe("POST /api/sessions/:sessionId/messages offline desktop guard", () => {
	it("returns 403 when sending to an offline desktop project session", async () => {
		const db = await getRidgeDb();
		const deviceId = `device-offline-send-${Date.now()}`;
		const projectId = `project-desktop-send-${Date.now()}`;
		const sessionId = `session-desktop-send-${Date.now()}`;
		const projectPath = path.join(os.homedir(), "ridge-workspace", `.desktop-send-${Date.now()}`);

		db.prepare(
			`INSERT INTO devices(device_id, name, device_type, status, capabilities_json, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(deviceId, "Desktop", "desktop", "offline", "{}", Date.now(), Date.now());

		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, source, workspace_path, device_id, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(projectId, "Desktop Project", projectPath, 0, Date.now(), "external", "desktop", "", deviceId, Date.now());

		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-session", projectPath, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-session", "project", "project", "", projectId, "", deviceId, "desktop", 0, 0, Date.now(), Date.now());

		const res = await api.post(`/api/sessions/${sessionId}/messages`).send({ prompt: "hi" });
		expect(res.status).toBe(403);
	});
});

describe("DELETE /api/sessions/:sessionId cleans up session_index", () => {
	it("removes session_index rows after session deletion", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-delete-index-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "delete-test", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "delete-test", "workspace", "workspace", WORKSPACE, "", "", "", "server", 0, 0, Date.now(), Date.now());

		const res = await api.delete(`/api/sessions/${sessionId}`);
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);

		const indexRow = db
			.prepare("SELECT session_id FROM session_index WHERE session_id = ?")
			.get(sessionId) as { session_id: string } | undefined;
		expect(indexRow).toBeUndefined();
	});
});
