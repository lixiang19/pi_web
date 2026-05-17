import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clips (
  clip_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_milestones (
  milestone_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date INTEGER,
  is_system INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_milestones_default
  ON workspace_milestones(workspace_path, title)
  WHERE is_system = 1;
CREATE TABLE IF NOT EXISTS workspace_tasks (
  task_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  project_id TEXT,
  milestone_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  due_date INTEGER,
  blocked_reason TEXT,
  processing_session_id TEXT UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(milestone_id) REFERENCES workspace_milestones(milestone_id) ON DELETE RESTRICT
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

	it("uploads attachment to temporary directory and records in DB", async () => {
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

		// Verify file exists in .ridge/fleeting-attachments
		const attachmentDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		const files = await fs.readdir(attachmentDir);
		expect(files).toHaveLength(1);

		// Verify DB record
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

	it("rejects attachment upload for non-existent note", async () => {
		const res = await request(app)
			.post("/api/fleeting/non-existent/attachments")
			.attach("files", Buffer.from("test"), { filename: "test.txt" });

		expect(res.status).toBe(404);
	});

	it("cleans up temporary attachments when note is deleted", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "要删除的闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("test"), { filename: "test.txt" });

		// Verify file exists
		const attachmentDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(attachmentDir)).toHaveLength(1);

		// Delete note
		const delRes = await request(app).delete(`/api/fleeting/${noteId}`);
		expect(delRes.status).toBe(200);
		expect(delRes.body.deleted).toBe(true);

		// Verify files cleaned up
		await expect(fs.readdir(attachmentDir)).rejects.toThrow();

		// Verify DB records cleaned up
		const rows = db
			.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
			.all(noteId) as unknown[];
		expect(rows).toHaveLength(0);
	});

	it("migrates attachments to formal directory on journal processing", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "带附件的日记闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("diary attachment"), { filename: "diary.txt" });

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/journal`)
			.send({ content: "带附件的日记闪念" });

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		expect(res.body.migratedAttachments).toHaveLength(1);
		expect(res.body.migratedAttachments[0]).toContain("附件/diary.txt");

		// Verify file migrated to formal directory
		const formalPath = path.join(workspaceDir, "附件", "diary.txt");
		const content = await fs.readFile(formalPath, "utf-8");
		expect(content).toBe("diary attachment");

		// Verify temp file removed
		const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		await expect(fs.readdir(tempDir)).rejects.toThrow();
	});

	it("migrates attachments to formal directory on clip processing", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "带附件的剪藏闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("clip attachment"), { filename: "clip.pdf" });

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/clip`)
			.send({ title: "剪藏", content: "带附件的剪藏闪念" });

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		expect(res.body.migratedAttachments).toHaveLength(1);

		// Verify file migrated
		const formalPath = path.join(workspaceDir, "附件", "clip.pdf");
		const content = await fs.readFile(formalPath, "utf-8");
		expect(content).toBe("clip attachment");
	});

	it("resolves filename conflict by appending suffix", async () => {
		// First note with attachment
		const note1Res = await request(app)
			.post("/api/fleeting")
			.send({ content: "第一条" });
		const note1Id = note1Res.body.note.id;
		await request(app)
			.post(`/api/fleeting/${note1Id}/attachments`)
			.attach("files", Buffer.from("first"), { filename: "conflict.txt" });
		await request(app)
			.post(`/api/fleeting/${note1Id}/process/journal`)
			.send({ content: "第一条" });

		// Second note with same filename
		const note2Res = await request(app)
			.post("/api/fleeting")
			.send({ content: "第二条" });
		const note2Id = note2Res.body.note.id;
		await request(app)
			.post(`/api/fleeting/${note2Id}/attachments`)
			.attach("files", Buffer.from("second"), { filename: "conflict.txt" });
		const res = await request(app)
			.post(`/api/fleeting/${note2Id}/process/journal`)
			.send({ content: "第二条" });

		expect(res.status).toBe(200);
		expect(res.body.migratedAttachments).toHaveLength(1);
		// Should have different filename with suffix
		expect(res.body.migratedAttachments[0]).not.toBe(path.join(workspaceDir, "附件", "conflict.txt"));
		expect(path.basename(res.body.migratedAttachments[0])).toMatch(/^conflict-[a-f0-9]{6}\.txt$/);

		// Both files should exist
		const attachmentsDir = path.join(workspaceDir, "附件");
		const files = await fs.readdir(attachmentsDir);
		expect(files.filter((f) => f.startsWith("conflict"))).toHaveLength(2);
	});

	it("keeps temporary attachments when task processing fails", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "任务闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("task attachment"), { filename: "task.txt" });

		// Send invalid payload to cause failure
		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "" });

		expect(res.status).toBe(400);

		// Note should still exist
		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);

		// Attachment should still exist in temp dir
		const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(tempDir)).toHaveLength(1);
	});

	it("migrates attachments and deletes note on successful task processing", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "任务闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("task attachment"), { filename: "task.txt" });

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "整理任务系统", priority: "normal", acceptanceCriteria: "完成" });

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		expect(res.body.task.title).toBe("整理任务系统");
		expect(res.body.migratedAttachments).toHaveLength(1);

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toEqual([]);

		const formalPath = path.join(workspaceDir, "附件", "task.txt");
		const content = await fs.readFile(formalPath, "utf-8");
		expect(content).toBe("task attachment");
	});

	it("keeps fleeting note and temp attachments when copy to formal directory fails", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "迁移失败闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("content"), { filename: "doc.txt" });

		// Make target directory read-only to force copy failure
		const targetDir = path.join(workspaceDir, "附件");
		await fs.mkdir(targetDir, { recursive: true });
		await fs.chmod(targetDir, 0o500);

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "任务", priority: "normal", acceptanceCriteria: "完成" });

		expect(res.status).toBe(500);

		// Note must still exist
		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);
		expect(list.body.notes[0].id).toBe(noteId);

		// Temp attachment must still exist
		const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(tempDir)).toHaveLength(1);

		// DB record must still exist
		const rows = db
			.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
			.all(noteId) as unknown[];
		expect(rows).toHaveLength(1);

		// Restore permission for cleanup
		await fs.chmod(targetDir, 0o755);
	});

	it("keeps fleeting note and temp attachments when target INSERT fails after successful copy", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "事务失败闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("content"), { filename: "doc.txt" });

			// Monkey-patch db.prepare to throw on INSERT so the copy succeeds but transaction fails
			const originalPrepare = db.prepare.bind(db);
			const prepareSpy = vi.spyOn(db, "prepare").mockImplementation((sql: unknown) => {
				const source = typeof sql === "string" ? sql : String(sql);
				if (source.includes("INSERT INTO workspace_tasks")) {
					throw new Error("Simulated DB failure");
				}
				return originalPrepare(source);
			});

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "任务", priority: "normal", acceptanceCriteria: "完成" });

		expect(res.status).toBe(500);

			prepareSpy.mockRestore();

		// Formal file was written but note must still exist because INSERT failed
		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);

		// Temp file must still exist
		const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
		expect(await fs.readdir(tempDir)).toHaveLength(1);

		// Temp DB record must still exist
		const rows = db
			.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
			.all(noteId) as unknown[];
		expect(rows).toHaveLength(1);
	});
});
