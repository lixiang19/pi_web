import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFleetingRouter } from "../routes/fleeting.js";
import { createTempDir } from "../test/helpers.js";

type TestDatabase = ReturnType<typeof Database>;

describe("fleeting attachments lifecycle", () => {
	let workspaceDir: string;
	let dbPath: string;
	let db: TestDatabase;
	let cleanup: () => Promise<void>;
	let app: ReturnType<typeof express>;

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-fleeting-att-");
		dbPath = path.join(workspaceDir, "ridge-test.db");
		db = new Database(dbPath);
		db.exec(`
CREATE TABLE IF NOT EXISTS fleeting_notes (
  note_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  analysis_status TEXT NOT NULL,
  recommendation_type TEXT,
  recommendation_text TEXT,
  draft TEXT,
  requires_input INTEGER NOT NULL DEFAULT 0,
  pi_session_id TEXT,
  pi_session_file TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  capture_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fleeting_attachments (
  attachment_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fleeting_attachments_note
  ON fleeting_attachments(note_id, created_at DESC);
		`);

		app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
			}),
		);
		app.use((err: Error & { statusCode?: number }, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, _next: unknown) => {
			res.status(err.statusCode ?? 500).json({ error: err.message });
		});
		cleanup = async () => {
			db.close();
			await fs.rm(workspaceDir, { recursive: true, force: true });
		};
	});

	afterEach(async () => {
		await cleanup();
	});

	it("uploads attachment to temporary directory and records it in DB", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "带附件的闪念" });
		const noteId = noteRes.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("test file content"), { filename: "test.txt" });

		expect(res.status).toBe(201);
		expect(res.body.attachments).toHaveLength(1);
		expect(res.body.attachments[0].originalName).toBe("test.txt");
		expect(res.body.attachments[0].mimeType).toBe("text/plain");
		expect(res.body.attachments[0].size).toBe(17);
		expect(res.body.attachments[0].sha256).toBeTruthy();

		const attachmentDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(attachmentDir)).toHaveLength(1);

		const row = db
			.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
			.get(noteId) as { attachment_id: string; original_name: string };
		expect(row).toBeTruthy();
		expect(row.original_name).toBe("test.txt");
	});

	it("lists attachments for a note", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "带附件的闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("content1"), { filename: "file1.txt" })
			.attach("files", Buffer.from("content2"), { filename: "file2.png" });

		const res = await request(app).get(`/api/fleeting/${noteId}/attachments`);
		expect(res.status).toBe(200);
		expect(res.body.attachments).toHaveLength(2);
		expect(res.body.attachments.map((a: { originalName: string }) => a.originalName).sort()).toEqual(["file1.txt", "file2.png"]);
	});

	it("rejects attachment upload for a non-existent note", async () => {
		const res = await request(app)
			.post("/api/fleeting/non-existent/attachments")
			.attach("files", Buffer.from("test"), { filename: "test.txt" });

		expect(res.status).toBe(404);
	});

	it("keeps temporary attachments because manual processing actions are no longer exposed", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "AI 稍后自主处理这个附件" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("attachment"), { filename: "doc.txt" });

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/attachment`)
			.send({});

		expect(res.status).toBe(404);
		const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(tempDir)).toHaveLength(1);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM fleeting_attachments WHERE note_id = ?")
				.get(noteId),
		).toEqual({ count: 1 });
	});

	it("cleans up temporary attachments when the note is deleted", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "要删除的闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("test"), { filename: "test.txt" });

		const attachmentDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(attachmentDir)).toHaveLength(1);

		const delRes = await request(app).delete(`/api/fleeting/${noteId}`);
		expect(delRes.status).toBe(200);
		expect(delRes.body.deleted).toBe(true);

		await expect(fs.readdir(attachmentDir)).rejects.toThrow();
		const rows = db
			.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
			.all(noteId) as unknown[];
		expect(rows).toHaveLength(0);
	});
});
