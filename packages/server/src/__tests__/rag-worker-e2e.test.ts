import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBackgroundJobQueue } from "../background-jobs.js";
import { getRidgeDb } from "../db/index.js";
import {
	indexPendingTarget,
	markRagTargetPending,
	searchContent,
} from "../rag-indexer.js";
import { createRagWorker } from "../rag-worker.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "rag-worker-test");

function posixPath(value: string): string {
	return value.replace(/\\/g, "/");
}

describe("RAG worker end-to-end — production chain", () => {
	beforeEach(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.mkdir(TEST_ROOT, { recursive: true });
		const db = await getRidgeDb();
		db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${posixPath(TEST_ROOT)}%`);
		db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${posixPath(TEST_ROOT)}%`);
		db.prepare("DELETE FROM background_jobs WHERE related_id LIKE ? OR payload_json LIKE ?").run(`${posixPath(TEST_ROOT)}%`, `%${posixPath(TEST_ROOT)}%`);
	});

	afterEach(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		const db = await getRidgeDb();
		db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${posixPath(TEST_ROOT)}%`);
		db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${posixPath(TEST_ROOT)}%`);
		db.prepare("DELETE FROM background_jobs WHERE related_id LIKE ? OR payload_json LIKE ?").run(`${posixPath(TEST_ROOT)}%`, `%${posixPath(TEST_ROOT)}%`);
	});

	it("processes an explicit rag.index job for a pending markdown target", async () => {
		const db = await getRidgeDb();
		const jobQueue = createBackgroundJobQueue(db);
		const targetPath = posixPath(path.join(TEST_ROOT, `rag-auto-${Date.now()}.md`));
		await fs.writeFile(targetPath, "# Project Alpha\n\nUnique content XYZ123.", "utf-8");

		await markRagTargetPending(targetPath, {
			workspaceDir: TEST_ROOT,
			refreshPolicy: "deferred",
			event: "edit",
		});
		const statusRow = db
			.prepare("SELECT status, refresh_policy FROM search_index_status WHERE target_path = ?")
			.get(targetPath) as { status: string; refresh_policy: string } | undefined;
		expect(statusRow).toMatchObject({ status: "pending", refresh_policy: "deferred" });

		const queued = jobQueue.enqueue({
			type: "rag.index",
			relatedType: "file",
			relatedId: targetPath,
			payload: { targetPath, workspaceDir: posixPath(TEST_ROOT) },
			maxAttempts: 3,
		});
		const ragWorker = createRagWorker({ jobQueue, workspaceDir: TEST_ROOT });
		const claimedJob = jobQueue.claimNext("rag-worker", "rag.index");
		expect(claimedJob?.jobId).toBe(queued.jobId);
		await ragWorker.processOne(claimedJob!);

		const completed = jobQueue.get(queued.jobId);
		expect(completed).toMatchObject({ status: "completed", result: { indexed: true, skipped: false } });
		const indexedRow = db
			.prepare("SELECT status, indexed_at FROM search_index_status WHERE target_path = ?")
			.get(targetPath) as { status: string; indexed_at: number | null } | undefined;
		expect(indexedRow?.status).toBe("indexed");
		expect(indexedRow?.indexed_at).not.toBeNull();

		const searchResults = await searchContent("XYZ123", { workspaceDir: TEST_ROOT });
		expect(searchResults.some((item) => item.targetPath === targetPath && item.preview.includes("XYZ123"))).toBe(true);
	});

	it("keeps deferred edit chunks until an explicit worker job rebuilds them", async () => {
		const db = await getRidgeDb();
		const jobQueue = createBackgroundJobQueue(db);
		const targetPath = posixPath(path.join(TEST_ROOT, `rag-edit-auto-${Date.now()}.md`));
		await fs.writeFile(targetPath, "# Old Title\n\nOld content with marker ABC999.", "utf-8");

		await markRagTargetPending(targetPath, {
			workspaceDir: TEST_ROOT,
			refreshPolicy: "immediate",
			event: "upload",
		});
		const initialResult = await indexPendingTarget(targetPath, { workspaceDir: TEST_ROOT, event: "manual" });
		expect(initialResult).toMatchObject({ success: true, indexed: true });
		expect((await searchContent("ABC999", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(true);

		await fs.writeFile(targetPath, "# New Title\n\nCompletely new content with marker DEF888.", "utf-8");
		await markRagTargetPending(targetPath, {
			workspaceDir: TEST_ROOT,
			refreshPolicy: "deferred",
			event: "edit",
		});
		const pendingRow = db
			.prepare("SELECT status, refresh_policy FROM search_index_status WHERE target_path = ?")
			.get(targetPath) as { status: string; refresh_policy: string } | undefined;
		expect(pendingRow).toMatchObject({ status: "pending", refresh_policy: "deferred" });
		expect((await searchContent("DEF888", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(false);
		expect((await searchContent("ABC999", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(true);

		const queued = jobQueue.enqueue({
			type: "rag.index",
			relatedType: "file",
			relatedId: targetPath,
			payload: { targetPath, workspaceDir: posixPath(TEST_ROOT) },
			maxAttempts: 3,
		});
		const ragWorker = createRagWorker({ jobQueue, workspaceDir: TEST_ROOT });
		const claimedJob = jobQueue.claimNext("rag-worker", "rag.index");
		expect(claimedJob?.jobId).toBe(queued.jobId);
		await ragWorker.processOne(claimedJob!);

		expect((await searchContent("DEF888", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(true);
		expect((await searchContent("ABC999", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(false);
	});

	it("has a nightly worker entry that indexes deferred markdown edits", async () => {
		const db = await getRidgeDb();
		const jobQueue = createBackgroundJobQueue(db);
		const targetPath = posixPath(path.join(TEST_ROOT, `rag-nightly-${Date.now()}.md`));
		await fs.writeFile(targetPath, "# Nightly\n\nold-nightly-token", "utf-8");
		await markRagTargetPending(targetPath, {
			workspaceDir: TEST_ROOT,
			refreshPolicy: "immediate",
			event: "upload",
		});
		await indexPendingTarget(targetPath, { workspaceDir: TEST_ROOT, event: "manual" });

		await fs.writeFile(targetPath, "# Nightly\n\nnew-nightly-token", "utf-8");
		await markRagTargetPending(targetPath, {
			workspaceDir: TEST_ROOT,
			refreshPolicy: "deferred",
			event: "edit",
		});

		const ragWorker = createRagWorker({ jobQueue, workspaceDir: TEST_ROOT });
		const summary = await ragWorker.runNightlyOnce();
		expect(summary).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
		expect((await searchContent("new-nightly-token", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(true);
		expect((await searchContent("old-nightly-token", { workspaceDir: TEST_ROOT })).some((item) => item.targetPath === targetPath)).toBe(false);
	});
});
