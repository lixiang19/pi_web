import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFleetingRouter } from "../routes/fleeting.js";
import { createTempDir } from "../test/helpers.js";

type TestDatabase = ReturnType<typeof Database>;

describe("fleeting API", () => {
	let workspaceDir: string;
	let dbPath: string;
	let db: TestDatabase;
	let cleanup: () => Promise<void>;
	let app: ReturnType<typeof express>;
	let runAnalysis: (noteId: string) => Promise<void>;

	beforeEach(async () => {
		workspaceDir = await createTempDir("ridge-fleeting-");
		dbPath = path.join(workspaceDir, "ridge-test.db");
		db = new Database(dbPath);
		// Bootstrap schema for isolated test DB (normally done by migrations)
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
CREATE INDEX IF NOT EXISTS idx_fleeting_notes_created_at
  ON fleeting_notes(created_at DESC);
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
		runAnalysis = vi.fn(() => undefined);
		app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => ({ run: runAnalysis, resetJob: vi.fn() }),
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

	it("lists only unprocessed fleeting notes", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "写一段复盘" });
		await request(app).delete(`/api/fleeting/${created.body.note.id}`);

		const list = await request(app).get("/api/fleeting");
		expect(list.status).toBe(200);
		expect(list.body.notes).toEqual([]);
	});

	it("writes to today's journal and deletes the original fleeting note", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "今天把闪念系统边界讨论清楚了" });

		const res = await request(app)
			.post(`/api/fleeting/${created.body.note.id}/process/journal`)
			.send({ content: "今天把闪念系统边界讨论清楚了" });

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		const today = new Date();
		const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
		const journalPath = path.join(
			workspaceDir,
			"日记",
			String(today.getFullYear()),
			String(today.getMonth() + 1).padStart(2, "0"),
			`${date}.md`,
		);
		await expect(fs.readFile(journalPath, "utf-8")).resolves.toContain(
			"今天把闪念系统边界讨论清楚了",
		);
		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toEqual([]);
	});

	it("appends multiple fleeting notes under a single journal heading", async () => {
		const first = await request(app)
			.post("/api/fleeting")
			.send({ content: "第一条日记闪念" });
		const second = await request(app)
			.post("/api/fleeting")
			.send({ content: "第二条日记闪念" });

		await request(app)
			.post(`/api/fleeting/${first.body.note.id}/process/journal`)
			.send({ content: "第一条日记闪念" });
		await request(app)
			.post(`/api/fleeting/${second.body.note.id}/process/journal`)
			.send({ content: "第二条日记闪念" });

		const today = new Date();
		const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
		const journalPath = path.join(
			workspaceDir,
			"日记",
			String(today.getFullYear()),
			String(today.getMonth() + 1).padStart(2, "0"),
			`${date}.md`,
		);
		const content = await fs.readFile(journalPath, "utf-8");
		expect(content.match(/^## 闪念$/gm)).toHaveLength(1);
		expect(content).toContain("第一条日记闪念");
		expect(content).toContain("第二条日记闪念");
	});

	it("creates a DB clip and deletes the original fleeting note", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "https://example.com 好文" });

		const res = await request(app)
			.post(`/api/fleeting/${created.body.note.id}/process/clip`)
			.send({
				title: "好文",
				url: "https://example.com",
				content: "https://example.com 好文",
				source: "闪念",
			});

		expect(res.status).toBe(200);
		expect(res.body.clip.title).toBe("好文");
		expect(res.body.deleted).toBe(true);
		const row = db
			.prepare("SELECT title, url, content FROM clips WHERE clip_id = ?")
			.get(res.body.clip.id) as { title: string; url: string; content: string };
		expect(row).toEqual({
			title: "好文",
			url: "https://example.com",
			content: "https://example.com 好文",
		});
	});

	it("lists clips ordered by creation time", async () => {
		const first = await request(app)
			.post("/api/fleeting")
			.send({ content: "第一条剪藏" });
		const second = await request(app)
			.post("/api/fleeting")
			.send({ content: "第二条剪藏" });

		await request(app)
			.post(`/api/fleeting/${first.body.note.id}/process/clip`)
			.send({ title: "第一条", content: "第一条剪藏" });

		// Ensure distinct created_at timestamps so ORDER BY is deterministic
		await new Promise((r) => setTimeout(r, 5));

		await request(app)
			.post(`/api/fleeting/${second.body.note.id}/process/clip`)
			.send({ title: "第二条", content: "第二条剪藏" });

		const list = await request(app).get("/api/fleeting/clips");
		expect(list.status).toBe(200);
		expect(list.body.clips.map((clip: { title: string }) => clip.title)).toEqual([
			"第二条",
			"第一条",
		]);
	});

	it("creates a task and deletes the original fleeting note", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "明天整理任务系统" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "整理任务系统", priority: "normal", acceptanceCriteria: "完成闪念处理功能" });

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		expect(res.body.task).toBeTruthy();
		expect(res.body.task.title).toBe("整理任务系统");
		expect(res.body.task.status).toBe("pending");

		const row = db
			.prepare("SELECT title, status, priority, acceptance_criteria FROM workspace_tasks WHERE task_id = ?")
			.get(res.body.task.id) as { title: string; status: string; priority: string; acceptance_criteria: string };
		expect(row).toEqual({
			title: "整理任务系统",
			status: "pending",
			priority: "normal",
			acceptance_criteria: "完成闪念处理功能",
		});

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toEqual([]);
	});

	it("creates a milestone and deletes the original fleeting note", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "建立Q2里程碑" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/milestone`)
			.send({ title: "Q2 里程碑", goal: "完成核心功能", acceptanceCriteria: "所有模块通过验收" });

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		expect(res.body.milestone).toBeTruthy();
		expect(res.body.milestone.title).toBe("Q2 里程碑");
		expect(res.body.milestone.status).toBe("pending");

		const row = db
			.prepare("SELECT title, status, goal, acceptance_criteria FROM workspace_milestones WHERE milestone_id = ?")
			.get(res.body.milestone.id) as { title: string; status: string; goal: string; acceptance_criteria: string };
		expect(row).toEqual({
			title: "Q2 里程碑",
			status: "pending",
			goal: "完成核心功能",
			acceptance_criteria: "所有模块通过验收",
		});

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toEqual([]);
	});

	it("migrates attachments to formal directory on attachment processing", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "带附件的闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("attachment content"), { filename: "doc.txt" });

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/attachment`);

		expect(res.status).toBe(200);
		expect(res.body.deleted).toBe(true);
		expect(res.body.migratedAttachments).toHaveLength(1);
		expect(res.body.migratedAttachments[0]).toContain("附件/doc.txt");

		const formalPath = path.join(workspaceDir, "附件", "doc.txt");
		const content = await fs.readFile(formalPath, "utf-8");
		expect(content).toBe("attachment content");

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toEqual([]);
	});

	it("keeps the fleeting note when task creation fails due to missing required fields", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "明天整理任务系统" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "" }); // invalid: empty title

		expect(res.status).toBe(400);

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);
		expect(list.body.notes[0].id).toBe(noteId);
	});

	it("keeps the fleeting note when milestone creation fails", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "里程碑闪念" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/milestone`)
			.send({ title: "" }); // invalid

		expect(res.status).toBe(400);

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);
	});

	it("keeps the fleeting note when clipping creation fails", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "剪藏闪念" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/clip`)
			.send({ title: "", content: "" }); // invalid

		expect(res.status).toBe(400);

		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);
	});

	it("allows selecting a project when processing to task", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "项目相关任务" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "项目任务", priority: "important", acceptanceCriteria: "完成", projectId: "proj-123" });

		expect(res.status).toBe(200);
		expect(res.body.task.projectId).toBe("proj-123");
	});

	it("allows selecting a project when processing to milestone", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "项目里程碑" });
		const noteId = created.body.note.id;

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/milestone`)
			.send({ title: "项目里程碑", goal: "达成目标", acceptanceCriteria: "验收", projectId: "proj-456" });

		expect(res.status).toBe(200);
		expect(res.body.milestone.projectId).toBe("proj-456");
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

	it("keeps fleeting note and temp attachments when attachment copy fails", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "附件迁移失败闪念" });
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

		// Temp file must still exist
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

	it("keeps fleeting note, temp attachments, and cleans up formal files when one of multiple attachments partially fails to migrate", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "多附件部分迁移失败闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("first content"), { filename: "first.txt" });

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("second content"), { filename: "second.txt" });

		// Monkey-patch fs.readFile to succeed on first call, fail on second call
		let callCount = 0;
		const originalReadFile = fs.readFile;
		const readFileSpy = vi.spyOn(fs, "readFile").mockImplementation(async (filepath, ...args) => {
			callCount++;
			if (callCount === 2) {
				throw new Error("Simulated read failure on second attachment");
			}
			return originalReadFile(filepath, ...(args as any[]));
		});

		try {
			const res = await request(app)
				.post(`/api/fleeting/${noteId}/process/attachment`)
				.send({});

			expect(res.status).toBe(500);
			expect(res.body.error).toContain("附件迁移失败");

			// Note must still exist
			const list = await request(app).get("/api/fleeting");
			expect(list.body.notes).toHaveLength(1);
			expect(list.body.notes[0].id).toBe(noteId);

			// All temp DB records must still exist
			const dbRows = db
				.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
				.all(noteId) as unknown[];
			expect(dbRows).toHaveLength(2);

			// All temp files must still exist
			const tempDir = path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
			const tempFiles = await fs.readdir(tempDir);
			expect(tempFiles).toHaveLength(2);

			// No half-copied files should remain in formal directory
			const formalDir = path.join(workspaceDir, "附件");
			try {
				const formalFiles = await fs.readdir(formalDir);
				expect(formalFiles).toHaveLength(0);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		} finally {
			readFileSpy.mockRestore();
		}
	});

	it("keeps fleeting note and temp attachments when target INSERT fails after successful copy", async () => {
		const noteRes = await request(app)
			.post("/api/fleeting")
			.send({ content: "事务失败闪念" });
		const noteId = noteRes.body.note.id;

		await request(app)
			.post(`/api/fleeting/${noteId}/attachments`)
			.attach("files", Buffer.from("content"), { filename: "doc.txt" });

		// Rename target DB table to force INSERT to fail
		db.prepare("ALTER TABLE workspace_tasks RENAME TO workspace_tasks_bak").run();

		const res = await request(app)
			.post(`/api/fleeting/${noteId}/process/task`)
			.send({ title: "任务", priority: "normal", acceptanceCriteria: "完成" });

		expect(res.status).toBe(500);

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

		// Restore table for other tests
		db.prepare("ALTER TABLE workspace_tasks_bak RENAME TO workspace_tasks").run();
	});
});
