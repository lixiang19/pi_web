import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getRidgeDb } from "../db/index.js";
import { getStorageDir } from "../utils/paths.js";
import { createSessionAttachmentsRouter } from "../session-attachments.js";

const createApp = () => {
	const app = express();
	app.use(express.json({ limit: "6mb" }));
	const mockEnsureSessionRecord = async (sessionId: string) => {
		return { id: sessionId } as import("../types/index.js").SessionRecord;
	};
	app.use("/api/sessions/:sessionId/attachments", createSessionAttachmentsRouter(mockEnsureSessionRecord));
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

	describe.sequential("session attachments api", () => {
	let storageDir = "";

	beforeEach(async () => {
		storageDir = await getStorageDir();
		const db = await getRidgeDb();
		db.prepare("DELETE FROM session_attachments WHERE session_id LIKE 'api-%'").run();
	});

	afterEach(async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM session_attachments WHERE session_id LIKE 'api-%'").run();
	});

	it("uploads attachments and writes to DB", async () => {
		const app = createApp();
		const response = await request(app)
			.post("/api/sessions/api-session-1/attachments")
			.attach("files", Buffer.from("hello world"), "test.txt")
			.expect(201);

		expect(response.body.attachments).toHaveLength(1);
		const att = response.body.attachments[0];
		expect(att.originalName).toBe("test.txt");
		expect(att.mimeType).toBe("text/plain");
		expect(att.size).toBe(11);
		expect(att.id).toBeTruthy();
		expect(att.sessionId).toBe("api-session-1");

		const filePath = path.join(storageDir, "session-attachments", "api-session-1", att.storedName);
		await expect(pathExists(filePath)).resolves.toBe(true);
	});

	it("lists attachments by session", async () => {
		const app = createApp();
		await request(app)
			.post("/api/sessions/api-session-2/attachments")
			.attach("files", Buffer.from("content A"), "a.txt")
			.attach("files", Buffer.from("content B"), "b.txt")
			.expect(201);

		const list = await request(app)
			.get("/api/sessions/api-session-2/attachments")
			.expect(200);

		expect(list.body.attachments).toHaveLength(2);
		const names = list.body.attachments.map((a: { originalName: string }) => a.originalName).sort();
		expect(names).toEqual(["a.txt", "b.txt"]);
	});

	it("sanitizes path-traversal filenames", async () => {
		const app = createApp();
		const response = await request(app)
			.post("/api/sessions/api-session-3/attachments")
			.attach("files", Buffer.from("x"), "../../../etc/passwd")
			.expect(201);

		const storedName = response.body.attachments[0].storedName;
		expect(storedName).not.toContain("..");
		expect(storedName).not.toContain("/");
	});

	it("returns empty list for session with no attachments", async () => {
		const app = createApp();
		const response = await request(app)
			.get("/api/sessions/api-session-empty/attachments")
			.expect(200);
		expect(response.body.attachments).toEqual([]);
	});
});
