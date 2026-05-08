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
		runAnalysis = vi.fn(async () => undefined);
		app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				analysisRunner: { run: runAnalysis },
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

	it("keeps the fleeting note when task processing is requested", async () => {
		const created = await request(app)
			.post("/api/fleeting")
			.send({ content: "明天整理任务系统" });

		const res = await request(app).post(
			`/api/fleeting/${created.body.note.id}/process/task`,
		);

		expect(res.status).toBe(202);
		expect(res.body.message).toContain("任务系统正在接入中");
		const list = await request(app).get("/api/fleeting");
		expect(list.body.notes).toHaveLength(1);
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
});
