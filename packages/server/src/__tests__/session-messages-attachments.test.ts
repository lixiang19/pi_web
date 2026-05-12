import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import express, { type Request, type Response } from "express";
import { getRidgeDb } from "../db/index.js";
import {
	createSessionAttachmentsRouter,
	storeSessionAttachment,
	validateAttachmentIds,
	buildAttachmentContext,
} from "../session-attachments.js";

const mockEnsureSessionRecord = async (sessionId: string) => {
	// Simulate that session-x / session-r / session-c / session-d / session-s / session-a exist
	// and session-404 does not
	if (sessionId === "session-404") {
		const err = new Error("Session not found") as Error & { statusCode?: number };
		err.statusCode = 404;
		throw err;
	}
	return { id: sessionId } as import("../types/index.js").SessionRecord;
};

	describe.sequential("session attachments", () => {
	beforeEach(async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM session_attachments WHERE session_id NOT LIKE 'api-%'").run();
	});

	afterEach(async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM session_attachments WHERE session_id NOT LIKE 'api-%'").run();
	});

	it("storeSessionAttachment writes file and DB record with consistent createdAt", async () => {
		const before = Date.now();
		const record = await storeSessionAttachment(
			"session-a",
			"notes.txt",
			Buffer.from("hello attachment"),
			"text/plain",
		);
		const after = Date.now();

		expect(record.session_id).toBe("session-a");
		expect(record.original_name).toBe("notes.txt");
		expect(record.size).toBe(16);
		expect(record.sha256).toBeTruthy();
		expect(record.created_at).toBeGreaterThanOrEqual(before);
		expect(record.created_at).toBeLessThanOrEqual(after);

		// DB record must match returned record created_at
		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT created_at FROM session_attachments WHERE attachment_id = ?")
			.get(record.attachment_id) as { created_at: number };
		expect(row.created_at).toBe(record.created_at);

		await expect(fs.access(record.stored_path)).resolves.toBeUndefined();
	});

	it("validateAttachmentIds returns true when all belong to session", async () => {
		const att1 = await storeSessionAttachment("session-x", "a.txt", Buffer.from("A"), "text/plain");
		const att2 = await storeSessionAttachment("session-x", "b.txt", Buffer.from("B"), "text/plain");
		const valid = await validateAttachmentIds("session-x", [att1.attachment_id, att2.attachment_id]);
		expect(valid).toBe(true);
	});

	it("validateAttachmentIds returns false when one belongs to another session", async () => {
		const att1 = await storeSessionAttachment("session-x", "a.txt", Buffer.from("A"), "text/plain");
		const att2 = await storeSessionAttachment("session-y", "b.txt", Buffer.from("B"), "text/plain");
		const valid = await validateAttachmentIds("session-x", [att1.attachment_id, att2.attachment_id]);
		expect(valid).toBe(false);
	});

	it("buildAttachmentContext includes text file contents", async () => {
		const att = await storeSessionAttachment("session-c", "code.ts", Buffer.from("const x = 1;"), "application/typescript");
		const context = await buildAttachmentContext([att.attachment_id]);
		expect(context).toContain("code.ts");
		expect(context).toContain("const x = 1;");
	});

	it("buildAttachmentContext marks binary files as references only and does NOT leak storedPath", async () => {
		const att = await storeSessionAttachment("session-d", "image.png", Buffer.from("\x89PNG"), "image/png");
		const context = await buildAttachmentContext([att.attachment_id]);
		expect(context).toContain("image.png");
		expect(context).toContain("Binary file");
		expect(context).not.toContain(att.stored_path);
		expect(context).not.toContain("session-attachments");
	});

	it("sanitizes Unix path-traversal filenames", async () => {
		const record = await storeSessionAttachment(
			"session-s",
			"../../../etc/passwd",
			Buffer.from("x"),
			"text/plain",
		);
		expect(record.stored_name).not.toContain("..");
		expect(record.stored_name).not.toContain("/");
	});

	it("sanitizes Windows backslash path-traversal filenames", async () => {
		const record = await storeSessionAttachment(
			"session-s",
			"..\\\secret.txt",
			Buffer.from("x"),
			"text/plain",
		);
		expect(record.stored_name).not.toContain("..");
		expect(record.stored_name).not.toContain("\\");
		expect(record.stored_name).not.toContain("/");
	});

	it("sanitizes filenames with only illegal chars to fallback 'file'", async () => {
		const record = await storeSessionAttachment(
			"session-s",
			"<>:*?|\0\x01",
			Buffer.from("x"),
			"text/plain",
		);
		expect(record.stored_name).not.toContain("<");
		expect(record.stored_name).not.toContain(">");
		expect(record.stored_name).not.toContain(":");
		expect(record.stored_name).not.toContain("*");
		expect(record.stored_name).not.toContain("?");
		expect(record.stored_name).not.toContain("\\");
		// stored_name = attachmentId-file, so basename after last dash should be "file"
		const base = record.stored_name.slice(record.stored_name.lastIndexOf("-") + 1);
		expect(base).toBe("file");
	});

	it("router rejects upload to non-existent session and does not write DB", async () => {
		const app = express();
		app.use("/api/sessions/:sessionId/attachments", createSessionAttachmentsRouter(mockEnsureSessionRecord));
		app.use((err: Error & { statusCode?: number }, _req: Request, res: Response) => {
			res.status(err.statusCode ?? 500).json({ error: err.message });
		});

		const uploadRes = await request(app)
			.post("/api/sessions/session-404/attachments")
			.attach("files", Buffer.from("test"), "test.txt");

		expect(uploadRes.status).toBe(404);

		const db = await getRidgeDb();
		const rows = db.prepare("SELECT COUNT(*) as c FROM session_attachments WHERE session_id = ?").get("session-404") as { c: number };
		expect(rows.c).toBe(0);
	});

	it("router rejects list to non-existent session", async () => {
		const app = express();
		app.use("/api/sessions/:sessionId/attachments", createSessionAttachmentsRouter(mockEnsureSessionRecord));
		app.use((err: Error & { statusCode?: number }, _req: Request, res: Response) => {
			res.status(err.statusCode ?? 500).json({ error: err.message });
		});

		const listRes = await request(app)
			.get("/api/sessions/session-404/attachments");

		expect(listRes.status).toBe(404);
	});

	it("router uploads and lists attachments and response does NOT contain storedPath", async () => {
		const app = express();
		app.use("/api/sessions/:sessionId/attachments", createSessionAttachmentsRouter(mockEnsureSessionRecord));

		const uploadRes = await request(app)
			.post("/api/sessions/session-r/attachments")
			.attach("files", Buffer.from("router test"), "router.txt");

		expect(uploadRes.status).toBe(201);
		expect(uploadRes.body.attachments).toHaveLength(1);
		expect(uploadRes.body.attachments[0].originalName).toBe("router.txt");
		expect(uploadRes.body.attachments[0]).not.toHaveProperty("storedPath");
		expect(uploadRes.body.attachments[0]).not.toHaveProperty("stored_path");

		const listRes = await request(app)
			.get("/api/sessions/session-r/attachments");
		expect(listRes.status).toBe(200);
		expect(listRes.body.attachments).toHaveLength(1);
		expect(listRes.body.attachments[0]).not.toHaveProperty("storedPath");
		expect(listRes.body.attachments[0]).not.toHaveProperty("stored_path");
	});
});
