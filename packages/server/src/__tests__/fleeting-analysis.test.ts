import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import express from "express";
import request from "supertest";

import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createBackgroundJobQueue } from "../background-jobs.js";
import {
	createFleetingAnalysisRunner,
	createFleetingAnalysisWorker,
	type CreateFleetingAgentSessionFn,
} from "../fleeting-analysis.js";
import { createFleetingRouter } from "../routes/fleeting.js";
import { getFleetingAttachments } from "../fleeting-attachments.js";
import { FleetingEventHub, type FleetingEvent } from "../fleeting-events.js";

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

vi.mock("../fleeting-attachments.js", () => ({
	getFleetingAttachments: vi.fn(() => []),
}));

const mockGetFleetingAttachments = vi.mocked(getFleetingAttachments);

type FleetingSessionOptions = Parameters<CreateFleetingAgentSessionFn>[0];

const createMockSessionFactory = (
	onPrompt: (options: FleetingSessionOptions, prompt: string) => Promise<void> | void,
) => {
	const activeToolNamesByCall: string[][] = [];
	const createAgentSessionFn: CreateFleetingAgentSessionFn = vi.fn(async (options) => {
		const session = {
			sessionId: "fleeting-session-1",
			sessionFile: undefined,
			getActiveToolNames: () => [
				"read",
				"edit",
				"bash",
				"ask",
				"subagent",
				"steer_subagent",
				"get_subagent_result",
				"create_task",
				"exa_get_contents",
				"complete_internal_task",
			],
			setActiveToolsByName: vi.fn(async (names: string[]) => {
				activeToolNamesByCall.push(names);
			}),
			setModel: vi.fn(async () => {}),
			setThinkingLevel: vi.fn(async () => {}),
			prompt: vi.fn(async (prompt: string) => {
				await onPrompt(options, prompt);
			}),
		};
		return { session };
	});
	return { createAgentSessionFn, activeToolNamesByCall };
};

describe("fleeting agent runner", () => {
	it("enqueues a job when run is called", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		runner.run("note-1");

		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.type).toBe("fleeting.analyze");
		expect(jobs[0]?.relatedId).toBe("note-1");
		db.close();
	});

	it("does not enqueue duplicate jobs for the same note", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		runner.run("note-1");
		runner.run("note-1");

		expect(queue.list()).toHaveLength(1);
		db.close();
	});

	it("does not enqueue for processed notes", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, status, analysis_status, created_at, updated_at) VALUES(?, ?, 'processed', 'processed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		runner.run("note-1");

		expect(queue.list()).toHaveLength(0);
		db.close();
	});
});

describe("fleeting agent runner.resetJob", () => {
	it("deletes old job and enqueues a fresh one", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'failed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		runner.run("note-1");
		const firstJobId = queue.list()[0]?.jobId;
		expect(firstJobId).toBeDefined();

		runner.resetJob("note-1");
		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.jobId).not.toBe(firstJobId);
		expect(jobs[0]?.status).toBe("pending");

		const note = db
			.prepare("SELECT analysis_status, last_error FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as { analysis_status: string; last_error: string | null };
		expect(note.analysis_status).toBe("unanalyzed");
		expect(note.last_error).toBeNull();
		db.close();
	});
});

describe("fleeting agent worker", () => {
	beforeEach(() => {
		mockGetFleetingAttachments.mockReturnValue([]);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("only claims fleeting.analyze jobs, not other types", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const { createAgentSessionFn } = createMockSessionFactory(async () => {});

		queue.enqueue({ type: "memory.maintain", payload: {} });

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
			createAgentSessionFn,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 50));
		worker.stop();

		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.status).toBe("pending");
		expect(jobs[0]?.type).toBe("memory.maintain");
		expect(createAgentSessionFn).not.toHaveBeenCalled();
		db.close();
	});

	it("runs a real internal agent and marks the note processed only after the completion tool is called", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const eventHub = new FleetingEventHub();
		const events: FleetingEvent[] = [];
		eventHub.subscribe((event) => events.push(event));
		const { createAgentSessionFn, activeToolNamesByCall } = createMockSessionFactory(
			async (options, prompt) => {
				expect(prompt).toContain("Read a great article about SQLite");
				expect(prompt).toContain("complete_internal_task");
				expect(prompt).toContain("exa_get_contents");
				await options.completeInternalTask({
					status: "completed",
					summary: "保存到剪藏并建立后续阅读任务",
				});
			},
		);

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Read a great article about SQLite", Date.now(), Date.now());
		queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
		});

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
			createAgentSessionFn,
			eventHub,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 120));
		worker.stop();

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.status).toBe("processed");
		expect(note.analysis_status).toBe("processed");
		expect(note.recommendation_type).toBeNull();
		expect(note.recommendation_text).toBe("保存到剪藏并建立后续阅读任务");
		expect(note.draft).toBeNull();
		expect(note.requires_input).toBe(0);
		expect(note.last_error).toBeNull();

		expect(createAgentSessionFn).toHaveBeenCalledTimes(1);
		expect(activeToolNamesByCall.at(-1)).toEqual([
			"read",
			"edit",
			"bash",
			"create_task",
			"exa_get_contents",
			"complete_internal_task",
		]);

		const job = queue.list()[0];
		expect(job?.status).toBe("completed");
		expect(job?.result).toMatchObject({
			agentName: "fleeting-agent",
			status: "completed",
			summary: "保存到剪藏并建立后续阅读任务",
		});
		expect(events.map((event) => event.note.analysisStatus)).toEqual([
			"analyzing",
			"processed",
		]);
		expect(events.at(-1)?.note.status).toBe("processed");
		db.close();
	});

	it("records an agent-declared failure without retrying the job", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const eventHub = new FleetingEventHub();
		const events: FleetingEvent[] = [];
		eventHub.subscribe((event) => events.push(event));
		const { createAgentSessionFn } = createMockSessionFactory(async (options) => {
			await options.completeInternalTask({
				status: "failed",
				summary: "附件损坏，无法读取",
				error: "附件转换失败",
			});
		});

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Broken attachment", Date.now(), Date.now());
		queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
			maxAttempts: 3,
		});

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
			createAgentSessionFn,
			eventHub,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 120));
		worker.stop();

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.status).toBe("active");
		expect(note.analysis_status).toBe("failed");
		expect(note.last_error).toBe("附件转换失败");

		const job = queue.list()[0];
		expect(job?.status).toBe("completed");
		expect(job?.retryCount).toBe(0);
		expect(job?.result).toMatchObject({
			agentName: "fleeting-agent",
			status: "failed",
			error: "附件转换失败",
		});
		expect(events.map((event) => event.note.analysisStatus)).toEqual([
			"analyzing",
			"failed",
		]);
		expect(events.at(-1)?.note.lastError).toBe("附件转换失败");
		db.close();
	});

	it("fails and retries if the agent exits without calling the completion tool", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const { createAgentSessionFn } = createMockSessionFactory(async () => {});

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'analyzing', ?, ?)",
		).run("note-1", "Test", Date.now(), Date.now());
		queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
			maxAttempts: 3,
		});

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
			createAgentSessionFn,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 120));
		worker.stop();

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("unanalyzed");
		expect(note.last_error).toBe("fleeting-agent did not call complete_internal_task");
		expect(note.retry_count).toBe(1);

		const job = queue.list()[0];
		expect(job?.status).toBe("pending");
		expect(job?.retryCount).toBe(1);
		db.close();
	});

	it("fails when the internal completion status is invalid", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db, { retryDelaysMs: [0] });
		const { createAgentSessionFn } = createMockSessionFactory(async (options) => {
			await options.completeInternalTask({
				status: "processed" as never,
				summary: "wrong",
			});
		});

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Test", Date.now(), Date.now());
		queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
			maxAttempts: 1,
		});

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
			createAgentSessionFn,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 120));
		worker.stop();

		const note = db
			.prepare("SELECT analysis_status, last_error FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("failed");
		expect(note.last_error).toBe("complete_internal_task status must be completed or failed");
		expect(queue.list()[0]?.status).toBe("failed");
		db.close();
	});
});

describe("fleeting router with delayed analysis runner", () => {
	it("calls getAnalysisRunner at request time, not at creation time", async () => {
		const db = createDb();
		const workspaceDir = "/tmp/test-ws";
		const queue = createBackgroundJobQueue(db);

		const runnerRef: { value?: ReturnType<typeof createFleetingAnalysisRunner> } = {};

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => runnerRef.value,
			}),
		);

		const res1 = await request(app).post("/api/fleeting").send({ content: "Before runner" });
		expect(res1.status).toBe(201);
		expect(queue.list()).toHaveLength(0);

		runnerRef.value = createFleetingAnalysisRunner({ db, jobQueue: queue });

		const res2 = await request(app).post("/api/fleeting").send({ content: "After runner" });
		expect(res2.status).toBe(201);
		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.type).toBe("fleeting.analyze");

		db.close();
	});

	it("POST with delayAnalysis does not enqueue analysis", async () => {
		const db = createDb();
		const workspaceDir = "/tmp/test-ws";
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => runner,
			}),
		);

		const res = await request(app)
			.post("/api/fleeting")
			.send({ content: "Has attachments coming", delayAnalysis: true });
		expect(res.status).toBe(201);
		expect(queue.list()).toHaveLength(0);

		db.close();
	});
});

describe("POST /api/fleeting/:noteId/analyze", () => {
	it("triggers resetJob after runner is initialized", async () => {
		const db = createDb();
		const workspaceDir = "/tmp/test-ws";
		const queue = createBackgroundJobQueue(db);

		const runnerRef: { value?: ReturnType<typeof createFleetingAnalysisRunner> } = {};

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => runnerRef.value,
			}),
		);

		const now = Date.now();
		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, last_error, retry_count, created_at, updated_at) VALUES(?, ?, 'failed', 'old error', 2, ?, ?)",
		).run("note-1", "Bad note", now, now);

		runnerRef.value = createFleetingAnalysisRunner({ db, jobQueue: queue });

		const res = await request(app).post("/api/fleeting/note-1/analyze");
		expect(res.status).toBe(200);
		expect(res.body.triggered).toBe(true);
		expect(res.body.note.analysisStatus).toBe("unanalyzed");

		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.type).toBe("fleeting.analyze");
		expect(jobs[0]?.status).toBe("pending");

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("unanalyzed");
		expect(note.last_error).toBeNull();

		db.close();
	});

	it("returns 503 when runner is not yet initialized", async () => {
		const db = createDb();
		const workspaceDir = "/tmp/test-ws";
		const queue = createBackgroundJobQueue(db);

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => undefined,
			}),
		);
		app.use((err: Error & { statusCode?: number }, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, _next: unknown) => {
			res.status(err.statusCode ?? 500).json({ error: err.message });
		});

		const now = Date.now();
		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'failed', ?, ?)",
		).run("note-1", "Test", now, now);

		const res = await request(app).post("/api/fleeting/note-1/analyze");
		expect(res.status).toBe(503);
		expect(res.body.error).toContain("尚未就绪");
		expect(queue.list()).toHaveLength(0);

		db.close();
	});
});
