import fs from "node:fs/promises";
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
		try { await fs.unlink(symlinkPath); } catch {}
		await fs.symlink(os.homedir(), symlinkPath);
		const res = await api
			.post("/api/files/create")
			.send({ path: "symlink-outside/pwned.txt", content: "" });
		expect(res.status).toBe(400);
		// Should not have written file outside workspace
		const outsideFile = path.join(os.homedir(), "pwned.txt");
		await expect(fs.access(outsideFile)).rejects.toThrow();
		// cleanup
		try { await fs.unlink(symlinkPath); } catch {}
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
