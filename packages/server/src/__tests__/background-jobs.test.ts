import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createBackgroundJobQueue } from "../background-jobs.js";

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

describe("background job queue", () => {
	it("dedupes active fleeting analysis jobs by related object", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);

		const first = queue.enqueue({
			type: "fleeting.analysis",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
		});
		const second = queue.enqueue({
			type: "fleeting.analysis",
			relatedType: "fleeting_note",
			relatedId: "note-1",
			payload: { noteId: "note-1" },
		});

		expect(second.jobId).toBe(first.jobId);
		expect(queue.list()).toHaveLength(1);
		db.close();
	});

	it("keeps memory jobs globally serial while one is running", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		queue.enqueue({ type: "memory.maintain", payload: { order: 1 } });
		queue.enqueue({ type: "memory.maintain", payload: { order: 2 } });

		const claimed = queue.claimNext("worker-a");
		expect(claimed?.type).toBe("memory.maintain");
		expect(queue.claimNext("worker-b")).toBeNull();

		db.close();
	});

	it("serializes summary jobs by daily related id", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		queue.enqueue({
			type: "summary.daily",
			relatedType: "daily",
			relatedId: "2026-05-10",
			payload: {},
		});
		queue.enqueue({
			type: "summary.daily",
			relatedType: "daily",
			relatedId: "2026-05-10",
			payload: {},
		});
		queue.enqueue({
			type: "summary.daily",
			relatedType: "daily",
			relatedId: "2026-05-11",
			payload: {},
		});

		expect(queue.list()).toHaveLength(2);
		const first = queue.claimNext("worker-a");
		const second = queue.claimNext("worker-b");
		expect(first?.relatedId).toBe("2026-05-10");
		expect(second?.relatedId).toBe("2026-05-11");

		db.close();
	});

	it("retries with backoff and emits a notification after max attempts", () => {
		const db = createDb();
		let currentTime = 1_000;
		const queue = createBackgroundJobQueue(db, {
			now: () => currentTime,
			retryDelaysMs: [100, 200],
		});
		const job = queue.enqueue({
			type: "file.process",
			payload: {},
			maxAttempts: 2,
			notifyOnFailure: true,
		});

		expect(queue.claimNext("worker-a")?.jobId).toBe(job.jobId);
		queue.fail(job.jobId, new Error("first"));
		expect(queue.get(job.jobId)).toMatchObject({
			status: "pending",
			retryCount: 1,
			nextRetryAt: 1_100,
		});
		expect(queue.claimNext("worker-a")).toBeNull();

		currentTime = 1_100;
		expect(queue.claimNext("worker-a")?.jobId).toBe(job.jobId);
		queue.fail(job.jobId, new Error("second"));
		expect(queue.get(job.jobId)).toMatchObject({
			status: "failed",
			retryCount: 2,
			lastError: "second",
		});
		expect(
			db
				.prepare("SELECT event_type, status FROM notification_events")
				.get(),
		).toEqual({ event_type: "background_job.failed", status: "unread" });

		db.close();
	});

	it("does not complete or fail jobs that are not currently running", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const job = queue.enqueue({
			type: "file.process",
			payload: {},
		});

		expect(() => queue.complete(job.jobId)).toThrow(/not running/);
		expect(() => queue.fail(job.jobId, new Error("not running"))).toThrow(/not running/);
		expect(queue.get(job.jobId)).toMatchObject({
			status: "pending",
			attemptCount: 0,
			retryCount: 0,
		});

		db.close();
	});

	it("allows re-queuing a failed related job", () => {
		const db = createDb();
		const queue = createBackgroundJobQueue(db);
		const first = queue.enqueue({
			type: "fleeting.analysis",
			relatedType: "fleeting_note",
			relatedId: "note-2",
			payload: { noteId: "note-2" },
			maxAttempts: 1,
		});

		expect(queue.claimNext("worker-a")?.jobId).toBe(first.jobId);
		queue.fail(first.jobId, new Error("failed forever"));
		const retried = queue.enqueue({
			type: "fleeting.analysis",
			relatedType: "fleeting_note",
			relatedId: "note-2",
			payload: { noteId: "note-2" },
		});

		expect(retried.jobId).not.toBe(first.jobId);
		expect(queue.list()).toHaveLength(2);
		db.close();
	});
});
