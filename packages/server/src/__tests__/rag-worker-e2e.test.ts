import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { app, setJobQueueForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { createBackgroundJobQueue } from "../background-jobs.js";
import { createRagWorker } from "../rag-worker.js";

let api: ReturnType<typeof request.agent>;
const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "rag-worker-test");

describe("RAG worker end-to-end — production chain", () => {
	beforeEach(async () => {
		api = await createAuthenticatedAgent(app);
		await fs.mkdir(TEST_ROOT, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		const db = await getRidgeDb();
		db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
		db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
		db.prepare("DELETE FROM background_jobs WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
	});

	it("upload .md enqueues rag.index job, worker processes it, search API hits", async () => {
		const db = await getRidgeDb();
		const jobQueue = createBackgroundJobQueue(db);
		setJobQueueForTesting(jobQueue);

		const fileName = `rag-auto-${Date.now()}.md`;
		const content = "# Project Alpha\n\nThis is a comprehensive document about Project Alpha with unique content XYZ123.";

		// Upload via API
		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", TEST_ROOT)
			.attach("files", Buffer.from(content), fileName);
		expect(res.status).toBe(201);

		const uploadedPath = res.body.entries[0].path;

		// Verify rag.index job was enqueued
		const jobs = db
			.prepare("SELECT * FROM background_jobs WHERE job_type = ? AND related_id = ?")
			.all("rag.index", uploadedPath) as Array<{ job_id: string; status: string; payload_json: string }>;
		expect(jobs.length).toBeGreaterThan(0);
		expect(jobs[0].status).toBe("pending");
		const payload = JSON.parse(jobs[0].payload_json) as { targetPath?: string };
		expect(payload.targetPath).toBe(uploadedPath);

		// Verify search_index_status is pending with real hash
		const expectedHash = crypto.createHash("sha256").update(content).digest("hex");
		const statusRow = db
			.prepare("SELECT status, content_hash FROM search_index_status WHERE target_path = ?")
			.get(uploadedPath) as { status: string; content_hash: string } | undefined;
		expect(statusRow).toBeDefined();
		expect(statusRow!.status).toBe("pending");
		expect(statusRow!.content_hash).toBe(expectedHash);

		// Run the RAG worker to process the job (simulating what startServer does)
		const ragWorker = createRagWorker({ jobQueue });
		const claimedJob = jobQueue.claimNext("rag-worker", "rag.index");
		expect(claimedJob).not.toBeNull();
		if (claimedJob) {
			await (ragWorker as unknown as { processOne: (j: typeof claimedJob) => Promise<void> }).processOne(claimedJob);
		}

		// Verify chunks were created
		const chunkCount = db
			.prepare("SELECT COUNT(*) as count FROM search_chunks WHERE target_path = ?")
			.get(uploadedPath) as { count: number };
		expect(chunkCount.count).toBeGreaterThan(0);

		// Verify search_index_status is now indexed
		const indexedRow = db
			.prepare("SELECT status, indexed_at FROM search_index_status WHERE target_path = ?")
			.get(uploadedPath) as { status: string; indexed_at: number | null } | undefined;
		expect(indexedRow).toBeDefined();
		expect(indexedRow!.status).toBe("indexed");
		expect(indexedRow!.indexed_at).not.toBeNull();

		// Search API should find the content
		const searchRes = await api.get(`/api/search/content?q=${encodeURIComponent("XYZ123")}`);
		expect(searchRes.status).toBe(200);
		expect(searchRes.body.results).toBeDefined();
		expect(searchRes.body.results.length).toBeGreaterThan(0);
		const match = searchRes.body.results.find((r: { targetPath: string }) => r.targetPath === uploadedPath);
		expect(match).toBeDefined();
		expect(match.preview).toContain("XYZ123");
	});

	it("edit .md enqueues new rag.index job, worker replaces old chunks", async () => {
		const db = await getRidgeDb();
		const jobQueue = createBackgroundJobQueue(db);
		setJobQueueForTesting(jobQueue);

		const fileName = `rag-edit-auto-${Date.now()}.md`;
		const initialContent = "# Old Title\n\nOld content with marker ABC999.";
		const filePath = path.join(TEST_ROOT, fileName);
		await fs.writeFile(filePath, initialContent, "utf-8");

		// Seed initial status
		const initialHash = crypto.createHash("sha256").update(initialContent).digest("hex");
		db.prepare(
			`INSERT INTO search_index_status (target_path, target_type, status, content_hash, updated_at)
			 VALUES (?, 'file', 'pending', ?, ?)
			 ON CONFLICT(target_path) DO UPDATE SET
				status = excluded.status,
				content_hash = excluded.content_hash,
				updated_at = excluded.updated_at`,
		).run(filePath.replace(/\\/g, "/"), initialHash, Date.now());

		// Enqueue and process initial indexing
		jobQueue.enqueue({
			type: "rag.index",
			relatedType: "file",
			relatedId: filePath.replace(/\\/g, "/"),
			payload: { targetPath: filePath.replace(/\\/g, "/") },
			maxAttempts: 3,
		});

		const ragWorker = createRagWorker({ jobQueue });
		let claimedJob = jobQueue.claimNext("rag-worker", "rag.index");
		if (claimedJob) {
			await (ragWorker as unknown as { processOne: (j: typeof claimedJob) => Promise<void> }).processOne(claimedJob);
		}

		// Verify initial content is searchable
		let searchRes = await api.get(`/api/search/content?q=${encodeURIComponent("ABC999")}`);
		expect(searchRes.body.results.length).toBeGreaterThan(0);

		// Edit via API
		const newContent = "# New Title\n\nCompletely new content with marker DEF888.";
		const editRes = await api.put("/api/files/content").send({
			root: TEST_ROOT,
			path: filePath,
			content: newContent,
		});
		expect(editRes.status).toBe(200);

		const posixPath = filePath.replace(/\\/g, "/");

		// Verify new rag.index job was enqueued
		const jobs = db
			.prepare("SELECT * FROM background_jobs WHERE job_type = ? AND related_id = ? AND status = ?")
			.all("rag.index", posixPath, "pending") as Array<{ job_id: string; payload_json: string }>;
		expect(jobs.length).toBeGreaterThan(0);
		const payload = JSON.parse(jobs[0].payload_json) as { targetPath?: string };
		expect(payload.targetPath).toBe(posixPath);

		// Verify status is pending with new hash
		const expectedNewHash = crypto.createHash("sha256").update(newContent).digest("hex");
		const pendingRow = db
			.prepare("SELECT status, content_hash FROM search_index_status WHERE target_path = ?")
			.get(posixPath) as { status: string; content_hash: string } | undefined;
		expect(pendingRow!.status).toBe("pending");
		expect(pendingRow!.content_hash).toBe(expectedNewHash);

		// Run worker on the new job
		claimedJob = jobQueue.claimNext("rag-worker", "rag.index");
		expect(claimedJob).not.toBeNull();
		if (claimedJob) {
			await (ragWorker as unknown as { processOne: (j: typeof claimedJob) => Promise<void> }).processOne(claimedJob);
		}

		// New content should be searchable
		searchRes = await api.get(`/api/search/content?q=${encodeURIComponent("DEF888")}`);
		expect(searchRes.status).toBe(200);
		expect(searchRes.body.results.length).toBeGreaterThan(0);
		const newMatch = searchRes.body.results.find((r: { targetPath: string }) => r.targetPath === posixPath);
		expect(newMatch).toBeDefined();

		// Old content should NOT be searchable (old chunks were replaced)
		searchRes = await api.get(`/api/search/content?q=${encodeURIComponent("ABC999")}`);
		const oldMatch = searchRes.body.results.find((r: { targetPath: string }) => r.targetPath === posixPath);
		expect(oldMatch).toBeUndefined();
	});
});
