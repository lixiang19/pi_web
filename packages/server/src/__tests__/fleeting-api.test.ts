import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFleetingRouter } from "../routes/fleeting.js";
import { createTempDir } from "../test/helpers.js";

type TestDatabase = ReturnType<typeof Database>;

const manualActionPaths = [
	"/process/journal",
	"/process/clip",
	"/process/task",
	"/process/milestone",
	"/process/attachment",
];

describe("fleeting API", () => {
	let workspaceDir: string;
	let dbPath: string;
	let db: TestDatabase;
	let cleanup: () => Promise<void>;
	let app: ReturnType<typeof express>;
	let runAnalysis: (noteId: string) => Promise<void>;
	let resetJob: (noteId: string) => void;

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-fleeting-");
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
CREATE INDEX IF NOT EXISTS idx_fleeting_notes_created_at
  ON fleeting_notes(created_at DESC);
CREATE TABLE IF NOT EXISTS clips (
  clip_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clips_created_at
  ON clips(created_at DESC);
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
		runAnalysis = vi.fn(async () => undefined);
		resetJob = vi.fn();
		app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => ({ run: runAnalysis, resetJob }),
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

	it("creates a fleeting note in the DB queue and triggers analysis", async () => {
		const res = await request(app)
			.post("/api/fleeting")
			.send({ content: "今天读到一篇 SQLite WAL 的资料" });

		expect(res.status).toBe(201);
		expect(res.body.note.content).toBe("今天读到一篇 SQLite WAL 的资料");
		expect(res.body.note.analysisStatus).toBe("unanalyzed");
		expect(runAnalysis).toHaveBeenCalledWith(res.body.note.id);
	});

	it("rejects empty content", async () => {
		const res = await request(app).post("/api/fleeting").send({ content: "  " });
		expect(res.status).toBe(400);
	});

	it("lists notes without hiding processed records", async () => {
		const first = await request(app)
			.post("/api/fleeting")
			.send({ content: "待处理闪念" });
		const second = await request(app)
			.post("/api/fleeting")
			.send({ content: "已处理闪念" });
		db.prepare("UPDATE fleeting_notes SET status = 'processed' WHERE note_id = ?")
			.run(second.body.note.id);

		const list = await request(app).get("/api/fleeting");
		expect(list.status).toBe(200);
		expect(list.body.notes.map((item: { id: string }) => item.id)).toEqual([
			second.body.note.id,
			first.body.note.id,
		]);
	});

	it("deletes a note and cleans up temporary attachments", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "要清理的闪念" });
		const noteId = created.body.note.id;
		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("attachment"), { filename: "note.txt" });

		const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(tempDir)).toHaveLength(1);

		const res = await request(app).delete(`/api/fleeting/${noteId}`);

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		await expect(fs.readdir(tempDir)).rejects.toThrow();
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM fleeting_attachments WHERE note_id = ?")
				.get(noteId),
		).toEqual({ count: 0 });
	});

	it("does not expose manual backend processing action routes", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "AI 自主处理，不走手动动作" });
		const noteId = created.body.note.id;

		for (const suffix of manualActionPaths) {
			const res = await request(app)
				.post(`/api/fleeting/${noteId}${suffix}`)
				.send({ title: "x", content: "x", priority: "normal", acceptanceCriteria: "x" });
			expect(res.status).toBe(404);
		}

		expect(db.prepare("SELECT status FROM fleeting_notes WHERE note_id = ?").get(noteId))
			.toEqual({ status: "pending" });
	});

	it("ignores late AI writeback after a note has been deleted", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "迟到分析测试" });
		await request(app).delete(`/api/fleeting/${created.body.note.id}`);

		const res = await request(app)
			.patch(`/api/fleeting/${created.body.note.id}/analysis`)
			.send({
				recommendationType: "journal",
				recommendationText: "建议写入今天日记",
				draft: "迟到分析测试",
				requiresInput: false,
			});

		expect(res.status).toBe(200);
		expect(res.body.ignored).toBe(true);
	});

	it("resets and re-enqueues analysis through the retry endpoint", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "需要重试分析" });

		const res = await request(app)
			.post(`/api/fleeting/${created.body.note.id}/analyze`);

		expect(res.status).toBe(200);
		expect(res.body.triggered).toBe(true);
		expect(resetJob).toHaveBeenCalledWith(created.body.note.id);
	});
});
