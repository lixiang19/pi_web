import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, setJobQueueForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { createBackgroundJobQueue } from "../background-jobs.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
});

describe("POST /api/files/create security", () => {
	it("rejects absolute paths", async () => {
		const res = await api.post("/api/files/create").send({ path: "/etc/passwd", content: "" });
		expect(res.status).toBe(400);
	});

	it("rejects ../ traversal before any IO", async () => {
		const res = await api.post("/api/files/create").send({ path: "../../../etc/passwd", content: "" });
		expect(res.status).toBe(400);
		// Should not have created directories outside workspace
		await expect(fs.access(path.join(os.homedir(), "etc"))).rejects.toThrow();
	});

	it("rejects .ridge paths", async () => {
		const res = await api.post("/api/files/create").send({ path: ".ridge/secret.txt", content: "" });
		expect(res.status).toBe(400);
	});

	it("creates nested files with content and preserves directory structure", async () => {
		const res = await api
			.post("/api/files/create")
			.send({ path: "nested/a/b/test-nested.txt", content: "hello nested" });
		expect(res.status).toBe(201);
		expect(res.body.name).toBe("test-nested.txt");
		const fullPath = path.join(WORKSPACE, "nested", "a", "b", "test-nested.txt");
		const content = await fs.readFile(fullPath, "utf-8");
		expect(content).toBe("hello nested");
		// cleanup
		try { await fs.unlink(fullPath); } catch {}
		try { await fs.rmdir(path.join(WORKSPACE, "nested", "a", "b")); } catch {}
		try { await fs.rmdir(path.join(WORKSPACE, "nested", "a")); } catch {}
		try { await fs.rmdir(path.join(WORKSPACE, "nested")); } catch {}
	});

	it("rejects realpath symlink traversal outside workspace", async () => {
		// Create a symlink in workspace pointing outside
		const symlinkPath = path.join(WORKSPACE, "symlink-outside");
		await fs.rm(symlinkPath, { recursive: true, force: true });
		await fs.symlink(os.homedir(), symlinkPath);
		const res = await api
			.post("/api/files/create")
			.send({ path: "symlink-outside/pwned.txt", content: "" });
		expect(res.status).toBe(400);
		// Should not have written file outside workspace
		const outsideFile = path.join(os.homedir(), "pwned.txt");
		await expect(fs.access(outsideFile)).rejects.toThrow();
		// cleanup
		await fs.rm(symlinkPath, { recursive: true, force: true });
	});
});

describe("POST /api/sessions/:sessionId/messages archived guard", () => {
	it("returns 403 when sending to archived session", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-archive-guard-${Date.now()}`;
		// Insert a fake session row directly
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "archive-test", WORKSPACE, "", Date.now(), Date.now(), 0);

		// Archive it
		const archiveRes = await api.post(`/api/sessions/${sessionId}/archive`).send({ archived: true });
		expect(archiveRes.status).toBe(200);

		// Try to send message
		const msgRes = await api.post(`/api/sessions/${sessionId}/messages`).send({ prompt: "hi" });
		expect(msgRes.status).toBe(403);
	});

	it("excludes archived sessions from GET /api/sessions", async () => {
		const db = await getRidgeDb();
		const sessionId = `session-archive-list-${Date.now()}`;
		// Insert a fake session row directly
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "archive-list-test", WORKSPACE, "", Date.now(), Date.now(), 0);

		// Before archive: should appear in list
		const beforeRes = await api.get("/api/sessions");
		expect(beforeRes.status).toBe(200);
		const beforeList = beforeRes.body as Array<{ id: string; archived: boolean }>;
		expect(beforeList.find((s) => s.id === sessionId)).toBeDefined();

		// Archive it
		const archiveRes = await api.post(`/api/sessions/${sessionId}/archive`).send({ archived: true });
		expect(archiveRes.status).toBe(200);

		// After archive: should NOT appear in list
		const afterRes = await api.get("/api/sessions");
		expect(afterRes.status).toBe(200);
		const afterList = afterRes.body as Array<{ id: string; archived: boolean }>;
		expect(afterList.find((s) => s.id === sessionId)).toBeUndefined();
	});
});

describe("POST /api/sessions/:sessionId/end", () => {
	it("queues a summary daily job for an indexed session", async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM background_jobs").run();
		const queue = createBackgroundJobQueue(db);
		setJobQueueForTesting(queue);

		const sessionId = `session-end-${Date.now()}`;
		const sessionFile = path.join(WORKSPACE, `${sessionId}.jsonl`);
		await fs.mkdir(WORKSPACE, { recursive: true });
		await fs.writeFile(
			sessionFile,
			`${JSON.stringify({
				type: "message",
				message: { role: "user", content: "整理这次会话", timestamp: Date.now() },
			})}\n`,
			"utf8",
		);

		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "end-test", WORKSPACE, sessionFile, Date.now(), Date.now(), 0);

		try {
			const res = await api.post(`/api/sessions/${sessionId}/end`).send({});
			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);

			const jobs = queue.list();
			expect(jobs).toHaveLength(1);
			expect(jobs[0]).toMatchObject({
				type: "summary.daily",
				relatedType: "session",
				relatedId: sessionId,
				status: "pending",
			});
			expect(jobs[0]?.payload).toMatchObject({
				sessionId,
				sessionFile,
				title: "end-test",
				workspaceDir: WORKSPACE,
			});
		} finally {
			setJobQueueForTesting(undefined);
			await fs.rm(sessionFile, { force: true });
		}
	});

	it("returns the existing summary job when the same indexed session is ended twice", async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM background_jobs").run();
		const queue = createBackgroundJobQueue(db);
		setJobQueueForTesting(queue);

		const sessionId = `session-end-idempotent-${Date.now()}`;
		const sessionFile = path.join(WORKSPACE, `${sessionId}.jsonl`);
		await fs.mkdir(WORKSPACE, { recursive: true });
		await fs.writeFile(
			sessionFile,
			`${JSON.stringify({
				type: "message",
				message: { role: "user", content: "重复结束", timestamp: Date.now() },
			})}\n`,
			"utf8",
		);

		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "idempotent-test", WORKSPACE, sessionFile, Date.now(), Date.now(), 0);

		try {
			const first = await api.post(`/api/sessions/${sessionId}/end`).send({});
			expect(first.status).toBe(200);
			const claimed = queue.claimNext("test-worker", "summary.daily");
			expect(claimed?.jobId).toBe(first.body.jobId);
			queue.complete(first.body.jobId, { ok: true });

			const second = await api.post(`/api/sessions/${sessionId}/end`).send({});
			expect(second.status).toBe(200);
			expect(second.body.jobId).toBe(first.body.jobId);
			expect(queue.list().filter((job) => job.type === "summary.daily")).toHaveLength(1);
		} finally {
			setJobQueueForTesting(undefined);
			await fs.rm(sessionFile, { force: true });
		}
	});

	it("creates a new summary job when the previous end job failed", async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM background_jobs").run();
		const queue = createBackgroundJobQueue(db);
		setJobQueueForTesting(queue);

		const sessionId = `session-end-retry-${Date.now()}`;
		const sessionFile = path.join(WORKSPACE, `${sessionId}.jsonl`);
		await fs.mkdir(WORKSPACE, { recursive: true });
		await fs.writeFile(
			sessionFile,
			`${JSON.stringify({
				type: "message",
				message: { role: "user", content: "失败后重试", timestamp: Date.now() },
			})}\n`,
			"utf8",
		);

		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived)
			 VALUES(?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "retry-test", WORKSPACE, sessionFile, Date.now(), Date.now(), 0);

		try {
			const first = await api.post(`/api/sessions/${sessionId}/end`).send({});
			expect(first.status).toBe(200);
			const claimed = queue.claimNext("test-worker", "summary.daily");
			expect(claimed?.jobId).toBe(first.body.jobId);
			queue.fail(first.body.jobId, new Error("summary failed"));
			db.prepare("UPDATE background_jobs SET status = 'failed' WHERE job_id = ?").run(first.body.jobId);

			const second = await api.post(`/api/sessions/${sessionId}/end`).send({});
			expect(second.status).toBe(200);
			expect(second.body.jobId).not.toBe(first.body.jobId);
			expect(queue.list().filter((job) => job.type === "summary.daily")).toHaveLength(2);
		} finally {
			setJobQueueForTesting(undefined);
			await fs.rm(sessionFile, { force: true });
		}
	});

	it("preserves indexed project context when ending a non-active external session", async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM background_jobs").run();
		const queue = createBackgroundJobQueue(db);
		setJobQueueForTesting(queue);

		const suffix = Date.now();
		const sessionId = `session-end-external-${suffix}`;
		const contextId = `context-external-${suffix}`;
		const projectRoot = path.join(os.tmpdir(), `ridge-external-${suffix}`);
		const sessionFile = path.join(projectRoot, `${sessionId}.jsonl`);
		await fs.mkdir(projectRoot, { recursive: true });
		await fs.writeFile(
			sessionFile,
			`${JSON.stringify({
				type: "message",
				message: { role: "user", content: "整理外部项目", timestamp: Date.now() },
			})}\n`,
			"utf8",
		);

		db.prepare(
			`INSERT INTO session_contexts(
				context_id, project_id, project_root, project_label,
				worktree_root, worktree_label, branch, is_git, cwd
			 ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			contextId,
			"project-external",
			projectRoot,
			"external-project",
			projectRoot,
			"external-project",
			null,
			0,
			projectRoot,
		);
		db.prepare(
			`INSERT INTO sessions(session_id, title, cwd, session_file, created_at, updated_at, archived, context_id)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(sessionId, "external-test", projectRoot, sessionFile, Date.now(), Date.now(), 0, contextId);

		try {
			const res = await api.post(`/api/sessions/${sessionId}/end`).send({});
			expect(res.status).toBe(200);
			const job = queue.list().find((item) => item.type === "summary.daily");
			expect(job?.payload).toMatchObject({
				sessionId,
				sessionFile,
				cwd: projectRoot,
				workspaceDir: WORKSPACE,
				projectLabel: "external-project",
				projectRoot,
			});
		} finally {
			setJobQueueForTesting(undefined);
			await fs.rm(projectRoot, { recursive: true, force: true });
		}
	});
});
