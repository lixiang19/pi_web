import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createBackgroundJobQueue } from "../background-jobs.js";
import {
	createFleetingAnalysisRunner,
	createFleetingAnalysisWorker,
} from "../fleeting-analysis.js";
import { createFleetingRouter } from "../routes/fleeting.js";
import express from "express";
import request from "supertest";

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

// ============================================================================
// Mock pi-coding-agent createAgentSession so we don't need real API keys
// ============================================================================
const mockSession = {
	prompt: vi.fn(),
	messages: [] as Array<{ role: string; content: unknown }>,
};

vi.mock("@mariozechner/pi-coding-agent", async () => {
	const actual = await vi.importActual("@mariozechner/pi-coding-agent");
	return {
		...actual,
		createAgentSession: vi.fn(() =>
			Promise.resolve({
				session: mockSession,
				extensionsResult: {},
			}),
		),
		SessionManager: {
			inMemory: () => ({
				shutdown: vi.fn(() => Promise.resolve()),
			}),
		},
	};
});

vi.mock("../fleeting-attachments.js", () => ({
	getFleetingAttachments: vi.fn(() => []),
}));

describe("fleeting analysis runner", () => {
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

	it("does not enqueue for already suggested notes", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'suggested', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		runner.run("note-1");

		expect(queue.list()).toHaveLength(0);
		db.close();
	});
});

describe("fleeting analysis runner.resetJob", () => {
	it("deletes old job and enqueues a fresh one", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'failed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		// First enqueue via run
		runner.run("note-1");
		const firstJobId = queue.list()[0]?.jobId;
		expect(firstJobId).toBeDefined();

		// Reset should delete old and create new
		runner.resetJob("note-1");
		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.jobId).not.toBe(firstJobId);
		expect(jobs[0]?.status).toBe("pending");

		// Note should be reset to unanalyzed
		const note = db
			.prepare("SELECT analysis_status FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as { analysis_status: string };
		expect(note.analysis_status).toBe("unanalyzed");

		db.close();
	});

	it("deletes any existing pending/running/failed job for the same note", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const runner = createFleetingAnalysisRunner({ db, jobQueue: queue });

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'failed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
			maxAttempts: 1,
		});
		// Mark as failed manually
		// Use cancel API instead of raw SQL to match production behavior.
		queue.cancel({ type: "fleeting.analyze", relatedType: "fleeting_note", relatedId: "note-1" });

		expect(queue.list()).toHaveLength(0);

		runner.resetJob("note-1");
		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.status).toBe("pending");

		db.close();
	});
});

describe("fleeting analysis worker", () => {
	beforeEach(() => {
		mockSession.prompt.mockReset();
		mockSession.messages = [];
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("only claims fleeting.analyze jobs, not other types", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		// Enqueue a non-fleeting job
		queue.enqueue({ type: "memory.maintain", payload: {} });
		expect(queue.list()).toHaveLength(1);

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 50));
		worker.stop();

		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.status).toBe("pending");
		expect(jobs[0]?.type).toBe("memory.maintain");
		db.close();
	});

	it("processes a fleeting job: runs analysis and marks note suggested", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Read a great article about SQLite", Date.now(), Date.now());

		mockSession.prompt.mockResolvedValue(undefined);
		mockSession.messages = [
			{ role: "user", content: "test" },
			{
				role: "assistant",
				content: '{"recommendationType":"clip","recommendationText":"建议收藏","draft":"SQLite article summary","requiresInput":false}',
			},
		];

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
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 100));
		worker.stop();

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("suggested");
		expect(note.recommendation_type).toBe("clip");
		expect(note.recommendation_text).toBe("建议收藏");
		expect(note.draft).toBe("SQLite article summary");

		const job = queue.list()[0];
		expect(job?.status).toBe("completed");
		db.close();
	});

	it("on first failure: note stays unanalyzed, job retries", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'analyzing', ?, ?)",
		).run("note-1", "Test", Date.now(), Date.now());

		mockSession.prompt.mockRejectedValue(new Error("LLM timeout"));
		mockSession.messages = [{ role: "user", content: "test" }];

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
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 100));
		worker.stop();

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("unanalyzed");
		expect(note.last_error).toBe("LLM timeout");
		expect(note.retry_count).toBe(1);

		const job = queue.list()[0];
		expect(job?.status).toBe("pending"); // will retry
		db.close();
	});

	it("on final failure: note becomes failed, job does not retry", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db, {
			retryDelaysMs: [0],
		});

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'analyzing', ?, ?)",
		).run("note-1", "Test", Date.now(), Date.now());

		mockSession.prompt.mockRejectedValue(new Error("Persistent error"));
		mockSession.messages = [{ role: "user", content: "test" }];

		queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
			maxAttempts: 1,
			notifyOnFailure: true,
		});

		const worker = createFleetingAnalysisWorker({
			db,
			jobQueue: queue,
			modelRegistry: {} as never,
			authStorage: {} as never,
			workspaceDir: "/tmp",
			pollIntervalMs: 10,
		});

		worker.start();
		await new Promise((r) => setTimeout(r, 100));
		worker.stop();

		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("failed");
		expect(note.last_error).toBe("Persistent error");
		expect(note.retry_count).toBe(1);

		const job = queue.list()[0];
		expect(job?.status).toBe("failed");

		const notif = db
			.prepare("SELECT * FROM notification_events WHERE event_type = ?")
			.get("background_job.failed") as Record<string, unknown> | undefined;
		expect(notif).toBeDefined();
		expect(notif?.body).toBe("Persistent error");
		db.close();
	});
});

	describe("fleeting router with delayed analysis runner", () => {
	it("calls getAnalysisRunner at request time, not at creation time", async () => {
		const db = createDb();
		const workspaceDir = "/tmp/test-ws";
		const queue = createBackgroundJobQueue(db);

		let runnerRef: ReturnType<typeof createFleetingAnalysisRunner> | undefined = undefined;

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => runnerRef,
			}),
		);

		// Before runner exists: creating a note should not crash and not enqueue
		const res1 = await request(app)
			.post("/api/fleeting")
			.send({ content: "Before runner" });
		expect(res1.status).toBe(201);
		expect(queue.list()).toHaveLength(0);

		// Now create the runner
		runnerRef = createFleetingAnalysisRunner({ db, jobQueue: queue });

		// After runner exists: creating a note should enqueue analysis
		const res2 = await request(app)
			.post("/api/fleeting")
			.send({ content: "After runner" });
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

	it("POST capture with attachments does not enqueue when delayAnalysis is true", async () => {
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
		app.use((err: Error & { statusCode?: number }, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, _next: unknown) => {
			res.status(err.statusCode ?? 500).json({ error: err.message });
		});

		const res = await request(app)
			.post("/api/fleeting/capture")
			.send({
				content: "Screenshot",
				type: "screenshot_region",
				attachments: [],
				delayAnalysis: true,
			});
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

		let runnerRef: ReturnType<typeof createFleetingAnalysisRunner> | undefined = undefined;

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({
				db,
				workspaceDir,
				getAnalysisRunner: () => runnerRef,
			}),
		);

		// Insert a note and an old job
		const now = Date.now();
		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, last_error, retry_count, created_at, updated_at) VALUES(?, ?, 'failed', 'old error', 2, ?, ?)",
		).run("note-1", "Bad note", now, now);

		runnerRef = createFleetingAnalysisRunner({ db, jobQueue: queue });

		// Call the analyze endpoint
		const res = await request(app).post("/api/fleeting/note-1/analyze");
		expect(res.status).toBe(200);
		expect(res.body.triggered).toBe(true);
		expect(res.body.note.analysisStatus).toBe("unanalyzed");

		// Old job should be gone, new job should exist
		const jobs = queue.list();
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.type).toBe("fleeting.analyze");
		expect(jobs[0]?.status).toBe("pending");

		// Note should be reset
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
		// No job queued because runner is undefined
		expect(queue.list()).toHaveLength(0);

		db.close();
	});
});

describe("fleeting router toPublicNote includes failure fields", () => {
	it("returns lastError and retryCount in list response", async () => {
		const db = createDb();
		const workspaceDir = "/tmp/test-ws";

		const app = express();
		app.use(express.json());
		app.use(
			"/api/fleeting",
			createFleetingRouter({ db, workspaceDir }),
		);

		const now = Date.now();
		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, last_error, retry_count, created_at, updated_at) VALUES(?, ?, 'failed', ?, ?, ?, ?)",
		).run("note-fail", "Bad note", "LLM rejected", 3, now, now);

		const res = await request(app).get("/api/fleeting");
		expect(res.status).toBe(200);
		expect(res.body.notes).toHaveLength(1);
		expect(res.body.notes[0].lastError).toBe("LLM rejected");
		expect(res.body.notes[0].retryCount).toBe(3);
		expect(res.body.notes[0].analysisStatus).toBe("failed");

		db.close();
	});
});

	describe("cancelled job safety", () => {
	it("worker complete() does not throw when job was cancelled mid-flight", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		const job = queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
		});

		// Simulate worker claiming
		const claimed = queue.claimNext("worker-1", "fleeting.analyze");
		expect(claimed).not.toBeNull();
		expect(claimed!.status).toBe("running");

		// Cancel while running
		queue.cancel({ type: "fleeting.analyze", relatedType: "fleeting_note", relatedId: "note-1" });
		const cancelledJob = queue.get(job.jobId);
		expect(cancelledJob!.status).toBe("cancelled");

		// Worker completes — should not throw and should return the cancelled job
		const afterComplete = queue.complete(job.jobId, { ok: true });
		expect(afterComplete!.status).toBe("cancelled");

		db.close();
	});

	it("worker fail() does not throw when job was cancelled mid-flight", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		const job = queue.enqueue({
			type: "fleeting.analyze",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
		});

		// Simulate worker claiming
		queue.claimNext("worker-1", "fleeting.analyze");

		// Cancel while running
		queue.cancel({ type: "fleeting.analyze", relatedType: "fleeting_note", relatedId: "note-1" });

		// Worker fails — should not throw and should return the cancelled job
		const afterFail = queue.fail(job.jobId, new Error("boom"));
		expect(afterFail!.status).toBe("cancelled");

		db.close();
	});

	it("old worker on success must NOT write to fleeting_notes after cancel", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		// Mock LLM to be slow so we can cancel mid-analysis
		mockSession.prompt.mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 80));
		});
		mockSession.messages = [
			{ role: "user", content: "test" },
			{
				role: "assistant",
				content: '{"recommendationType":"clip","recommendationText":"建议收藏","draft":"d","requiresInput":false}',
			},
		];

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
		});

		worker.start();

		// Wait for worker to claim the job
		await new Promise((r) => setTimeout(r, 30));

		// Cancel the job while analysis is running (prompt still in flight)
		queue.cancel({ type: "fleeting.analyze", relatedType: "fleeting_note", relatedId: "note-1" });

		// Reset note to unanalyzed (what resetJob does)
		db.prepare("UPDATE fleeting_notes SET analysis_status = 'unanalyzed' WHERE note_id = ?").run("note-1");

		// Wait for slow analysis to finish
		await new Promise((r) => setTimeout(r, 200));

		worker.stop();

		// The old worker must NOT have written its stale result
		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("unanalyzed");
		expect(note.recommendation_type).toBeNull();

		db.close();
	});

	it("old worker on error must NOT write to fleeting_notes after cancel", async () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		db.prepare(
			"INSERT INTO fleeting_notes(note_id, content, analysis_status, created_at, updated_at) VALUES(?, ?, 'unanalyzed', ?, ?)",
		).run("note-1", "Test content", Date.now(), Date.now());

		// Mock LLM to be slow and then fail
		mockSession.prompt.mockImplementation(async () => {
			await new Promise((r) => setTimeout(r, 80));
			throw new Error("LLM timeout");
		});
		mockSession.messages = [{ role: "user", content: "test" }];

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
		});

		worker.start();

		// Wait for worker to claim the job
		await new Promise((r) => setTimeout(r, 30));

		// Cancel the job while analysis is running
		queue.cancel({ type: "fleeting.analyze", relatedType: "fleeting_note", relatedId: "note-1" });

		// Reset note (what resetJob does)
		db.prepare("UPDATE fleeting_notes SET analysis_status = 'unanalyzed' WHERE note_id = ?").run("note-1");

		// Wait for slow failing analysis to finish
		await new Promise((r) => setTimeout(r, 200));

		worker.stop();

		// The old worker must NOT have written its stale error state
		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get("note-1") as Record<string, unknown>;
		expect(note.analysis_status).toBe("unanalyzed");
		expect(note.last_error).toBeNull();
		expect(note.retry_count).toBe(0);

		db.close();
	});
});
