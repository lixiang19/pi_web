import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { resolveSessionSummary } from "../session-payload.js";
import { createSessionMetadataStore } from "../session-metadata.js";
import {
  invalidateManagedProjectScopes,
} from "../session-indexer.js";

let api: ReturnType<typeof request.agent>;
const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
});

beforeEach(() => {
	invalidateManagedProjectScopes();
});

describe("session_index metadata in SessionSummary", () => {
	it("resolveSessionSummary includes sessionType, contextType, taskId, deviceId, runLocation from session_index", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-meta-summary-${Date.now()}`;
		// Insert session and matching session_index with metadata
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "meta-summary", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "meta-summary", "task", "task", "", "proj-1", "task-1", "dev-1", "desktop", 0, 0, Date.now(), Date.now());

		// We need a SessionRecord to call resolveSessionSummary. Build a minimal one.
		const mockRecord = {
			id: sessionId,
			cwd: WORKSPACE,
			status: "idle" as const,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			sessionFile: "",
			session: { sessionName: "meta-summary" } as any,
			selectedAgentName: undefined,
			explicitModelSpec: undefined,
			explicitThinkingLevel: undefined,
			resolvedModelSpec: undefined,
			resolvedThinkingLevel: undefined,
		};

		const summary = await resolveSessionSummary(mockRecord as any);
		expect(summary.sessionType).toBe("task");
		expect(summary.contextType).toBe("task");
		expect(summary.taskId).toBe("task-1");
		expect(summary.deviceId).toBe("dev-1");
		expect(summary.runLocation).toBe("desktop");
	});
});

describe("session_index archive sync", () => {
	it("setArchived updates both sessions and session_index", async () => {
		const db = await getRidgeDb();
		const store = createSessionMetadataStore();
		const sessionId = `session-arch-sync-${Date.now()}`;

		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "arch-sync", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "arch-sync", "workspace", "workspace", WORKSPACE, "", "", "", "server", 0, 0, Date.now(), Date.now());

		await store.setArchived([sessionId], true);

		const sessionsRow = db
			.prepare("SELECT archived, readonly FROM sessions WHERE session_id = ?")
			.get(sessionId) as { archived: number; readonly: number };
		expect(sessionsRow.archived).toBe(1);
		expect(sessionsRow.readonly).toBe(1);

		const indexRow = db
			.prepare("SELECT archived, readonly FROM session_index WHERE session_id = ?")
			.get(sessionId) as { archived: number; readonly: number };
		expect(indexRow.archived).toBe(1);
		expect(indexRow.readonly).toBe(1);
	});
});

describe("session_index has no message content columns", () => {
	it("does not contain message, content, or payload columns", async () => {
		const db = await getRidgeDb();
		const columns = db
			.prepare("PRAGMA table_info(session_index)")
			.all() as Array<{ name: string }>;
		const names = columns.map((c) => c.name);
		for (const forbidden of ["messages", "content", "payload", "prompt", "response"]) {
			expect(names).not.toContain(forbidden);
		}
	});
});

describe("desktop offline blocks operations", () => {
	it("returns 403 on GET /runtime for offline desktop session", async () => {
		const db = await getRidgeDb();
		const deviceId = `device-offline-rt-${Date.now()}`;
		const projectId = `project-desktop-rt-${Date.now()}`;
		const sessionId = `session-desktop-rt-${Date.now()}`;
		const projectPath = path.join(os.homedir(), "ridge-workspace", `.desktop-rt-${Date.now()}`);

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
		).run(sessionId, "desktop-rt", projectPath, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-rt", "project", "project", "", projectId, "", deviceId, "desktop", 0, 0, Date.now(), Date.now());

		const res = await api.get(`/api/sessions/${sessionId}/runtime`);
		expect(res.status).toBe(403);
	});

	it("returns 403 on GET /messages for offline desktop session", async () => {
		const db = await getRidgeDb();
		const deviceId = `device-offline-msg-${Date.now()}`;
		const projectId = `project-desktop-msg-${Date.now()}`;
		const sessionId = `session-desktop-msg-${Date.now()}`;
		const projectPath = path.join(os.homedir(), "ridge-workspace", `.desktop-msg-${Date.now()}`);

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
		).run(sessionId, "desktop-msg", projectPath, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "desktop-msg", "project", "project", "", projectId, "", deviceId, "desktop", 0, 0, Date.now(), Date.now());

		const res = await api.get(`/api/sessions/${sessionId}/messages`);
		expect(res.status).toBe(403);
	});
});

describe("SessionSummary exposes session metadata in list", () => {
	it("includes sessionType, contextType, taskId, deviceId, runLocation in GET /api/sessions", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-meta-list-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "meta-list", WORKSPACE, "", Date.now(), Date.now(), 0, 0);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "meta-list", "task", "task", "", "proj-1", "task-1", "dev-1", "desktop", 0, 0, Date.now(), Date.now());

		const res = await api.get("/api/sessions");
		expect(res.status).toBe(200);
		const session = res.body.find((s: { id: string }) => s.id === sessionId);
		expect(session).toBeDefined();
		expect(session.sessionType).toBe("task");
		expect(session.contextType).toBe("task");
		expect(session.taskId).toBe("task-1");
		expect(session.deviceId).toBe("dev-1");
		expect(session.runLocation).toBe("desktop");
	});
});

describe("session_index upsert project_id", () => {
	it("upserts project_id into session_index from context", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-upsert-project-${Date.now()}`;

		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "upsert-project", "workspace", "workspace", "", "old-project-id", "", "", "server", 0, 0, Date.now(), Date.now());

		// Reproduce the exact upsert SQL from session-indexer.ts
		const upsertSessionIndex = db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path,
				project_id, task_id, device_id, run_location,
				archived, readonly, created_at, updated_at
			 ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(session_id) DO UPDATE SET
				title = excluded.title,
				session_type = excluded.session_type,
				context_type = excluded.context_type,
				workspace_path = excluded.workspace_path,
				project_id = excluded.project_id,
				task_id = excluded.task_id,
				device_id = excluded.device_id,
				run_location = excluded.run_location,
				archived = COALESCE((SELECT archived FROM session_index WHERE session_id = excluded.session_id), excluded.archived),
				readonly = COALESCE((SELECT readonly FROM session_index WHERE session_id = excluded.session_id), excluded.readonly),
				created_at = excluded.created_at,
				updated_at = excluded.updated_at`,
		);
		upsertSessionIndex.run(
			sessionId, "upsert-project", "workspace", "workspace", "",
			"new-project-id", "", "", "server", 0, 0, Date.now(), Date.now(),
		);

		const indexRow = db
			.prepare("SELECT project_id FROM session_index WHERE session_id = ?")
			.get(sessionId) as { project_id: string | null };
		expect(indexRow.project_id).toBe("new-project-id");
	});
});

describe("session_index upsert preserves archived and readonly", () => {
	it("does not reset existing archived=1 and readonly=1 on conflict update", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-preserve-arch-${Date.now()}`;

		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "preserve-arch", "workspace", "workspace", "", "", "", "", "server", 1, 1, Date.now(), Date.now());

		const upsertSessionIndex = db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path,
				project_id, task_id, device_id, run_location,
				archived, readonly, created_at, updated_at
			 ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(session_id) DO UPDATE SET
				title = excluded.title,
				session_type = excluded.session_type,
				context_type = excluded.context_type,
				workspace_path = excluded.workspace_path,
				project_id = excluded.project_id,
				task_id = excluded.task_id,
				device_id = excluded.device_id,
				run_location = excluded.run_location,
				archived = COALESCE((SELECT archived FROM session_index WHERE session_id = excluded.session_id), excluded.archived),
				readonly = COALESCE((SELECT readonly FROM session_index WHERE session_id = excluded.session_id), excluded.readonly),
				created_at = excluded.created_at,
				updated_at = excluded.updated_at`,
		);
		upsertSessionIndex.run(
			sessionId, "preserve-arch", "workspace", "workspace", "",
			"", "", "", "server", 0, 0, Date.now(), Date.now(),
		);

		const indexRow = db
			.prepare("SELECT archived, readonly FROM session_index WHERE session_id = ?")
			.get(sessionId) as { archived: number; readonly: number };
		expect(indexRow.archived).toBe(1);
		expect(indexRow.readonly).toBe(1);
	});
});

describe("GET /api/sessions includes readonly", () => {
	it("readonly field is present in session list response", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-readonly-list-${Date.now()}`;
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, readonly)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "readonly-list", WORKSPACE, "", Date.now(), Date.now(), 0, 1);
		db.prepare(
			`INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, task_id, device_id, run_location, archived, readonly, created_at, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "readonly-list", "workspace", "workspace", WORKSPACE, "", "", "", "server", 0, 1, Date.now(), Date.now());

		const res = await api.get("/api/sessions");
		expect(res.status).toBe(200);
		const session = res.body.find((s: { id: string }) => s.id === sessionId);
		expect(session).toBeDefined();
		expect(session.readonly).toBe(true);
	});
});
