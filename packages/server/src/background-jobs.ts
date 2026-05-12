import crypto from "node:crypto";
import type Database from "better-sqlite3";

type RidgeDatabase = InstanceType<typeof Database>;

export type BackgroundJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface BackgroundJob {
	jobId: string;
	type: string;
	relatedType: string;
	relatedId: string;
	status: BackgroundJobStatus;
	payload: unknown;
	result: unknown;
	attemptCount: number;
	retryCount: number;
	maxAttempts: number;
	lastError: string | null;
	runAfter: number | null;
	nextRetryAt: number | null;
	lockedAt: number | null;
	lockedBy: string | null;
	completedAt: number | null;
	notifyOnFailure: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface EnqueueBackgroundJobInput {
	type: string;
	relatedType?: string;
	relatedId?: string;
	payload: unknown;
	runAfter?: number | null;
	maxAttempts?: number;
	notifyOnFailure?: boolean;
}

export interface BackgroundJobQueueOptions {
	now?: () => number;
	retryDelaysMs?: number[];
}

type BackgroundJobRow = {
	job_id: string;
	job_type: string;
	related_type: string;
	related_id: string;
	status: BackgroundJobStatus;
	payload_json: string;
	result_json: string | null;
	attempt_count: number;
	retry_count: number;
	max_attempts: number;
	last_error: string | null;
	run_after: number | null;
	next_retry_at: number | null;
	locked_at: number | null;
	locked_by: string | null;
	completed_at: number | null;
	notify_on_failure: number;
	created_at: number;
	updated_at: number;
};

const DEFAULT_RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

const parseJson = (value: string | null): unknown => {
	if (!value) return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
};

const mapRow = (row: BackgroundJobRow): BackgroundJob => ({
	jobId: row.job_id,
	type: row.job_type,
	relatedType: row.related_type,
	relatedId: row.related_id,
	status: row.status,
	payload: parseJson(row.payload_json),
	result: parseJson(row.result_json),
	attemptCount: row.attempt_count,
	retryCount: row.retry_count,
	maxAttempts: row.max_attempts,
	lastError: row.last_error,
	runAfter: row.run_after,
	nextRetryAt: row.next_retry_at,
	lockedAt: row.locked_at,
	lockedBy: row.locked_by,
	completedAt: row.completed_at,
	notifyOnFailure: row.notify_on_failure === 1,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const serialScope = (job: BackgroundJob): string | null => {
	if (job.type === "memory.maintain") {
		return "memory.maintain";
	}
	if (job.type === "summary.daily" && job.relatedType === "daily" && job.relatedId) {
		return `${job.type}:${job.relatedType}:${job.relatedId}`;
	}
	return null;
};

const assertRunningJob = (job: BackgroundJob | null, action: string): BackgroundJob => {
	if (!job) {
		throw new Error(`Cannot ${action} missing background job`);
	}
	if (job.status !== "running") {
		throw new Error(`Cannot ${action} background job that is not running`);
	}
	return job;
};

export interface CancelBackgroundJobFilter {
	type: string;
	relatedType?: string;
	relatedId?: string;
}

export const createBackgroundJobQueue = (
	db: RidgeDatabase,
	options: BackgroundJobQueueOptions = {},
) => {
	const now = options.now ?? (() => Date.now());
	const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

	const getRow = (jobId: string): BackgroundJobRow | undefined =>
		db.prepare("SELECT * FROM background_jobs WHERE job_id = ?").get(jobId) as
			| BackgroundJobRow
			| undefined;

	const get = (jobId: string): BackgroundJob | null => {
		const row = getRow(jobId);
		return row ? mapRow(row) : null;
	};

	const list = (): BackgroundJob[] =>
		(
			db
				.prepare("SELECT * FROM background_jobs ORDER BY created_at ASC")
				.all() as BackgroundJobRow[]
		).map(mapRow);

	const enqueue = (input: EnqueueBackgroundJobInput): BackgroundJob => {
		const relatedType = input.relatedType ?? "";
		const relatedId = input.relatedId ?? "";
		if (relatedType && relatedId) {
			const existing = db
				.prepare(
					`SELECT * FROM background_jobs
				 WHERE job_type = ? AND related_type = ? AND related_id = ?
					   AND status IN ('pending', 'running')
					 ORDER BY created_at ASC
					 LIMIT 1`,
				)
				.get(input.type, relatedType, relatedId) as BackgroundJobRow | undefined;
			if (existing) {
				return mapRow(existing);
			}
		}

		const createdAt = now();
		const jobId = `job-${crypto.randomUUID()}`;
		db.prepare(
			`INSERT INTO background_jobs(
				job_id, job_type, related_type, related_id, status, payload_json,
				result_json, attempt_count, retry_count, max_attempts, last_error,
				run_after, next_retry_at, locked_at, locked_by, completed_at,
				notify_on_failure, created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			jobId,
			input.type,
			relatedType,
			relatedId,
			"pending",
			JSON.stringify(input.payload ?? {}),
			null,
			0,
			0,
			input.maxAttempts ?? 3,
			null,
			input.runAfter ?? null,
			input.runAfter ?? null,
			null,
			null,
			null,
			input.notifyOnFailure ? 1 : 0,
			createdAt,
			createdAt,
		);

		return get(jobId)!;
	};

	const isSerialScopeRunning = (job: BackgroundJob): boolean => {
		const scope = serialScope(job);
		if (!scope) return false;
		return list().some(
			(item) =>
				item.jobId !== job.jobId &&
				item.status === "running" &&
				serialScope(item) === scope,
		);
	};

	const claimNext = (workerId: string, jobType?: string): BackgroundJob | null => {
		const timestamp = now();
		const candidates = (
			db
				.prepare(
					`SELECT * FROM background_jobs
					 WHERE status = 'pending'
					   AND (run_after IS NULL OR run_after <= ?)
					   AND (next_retry_at IS NULL OR next_retry_at <= ?)
					   ${jobType ? "AND job_type = ?" : ""}
					 ORDER BY created_at ASC`,
				)
				.all(...(jobType ? [timestamp, timestamp, jobType] : [timestamp, timestamp])) as BackgroundJobRow[]
		).map(mapRow);

		for (const candidate of candidates) {
			if (isSerialScopeRunning(candidate)) {
				continue;
			}
			const result = db.prepare(
				`UPDATE background_jobs
				 SET status = 'running',
				     attempt_count = attempt_count + 1,
				     locked_at = ?,
				     locked_by = ?,
				     updated_at = ?
				 WHERE job_id = ? AND status = 'pending'`,
		).run(timestamp, workerId, timestamp, candidate.jobId);

			if (result.changes !== 1) {
				continue;
			}
			return get(candidate.jobId);
		}

		return null;
	};

	const complete = (jobId: string, result: unknown = {}): BackgroundJob | null => {
		const job = get(jobId);
		if (!job || job.status === "cancelled") {
			// Silently ignore cancellation; the runner already stopped work.
			return job;
		}
		assertRunningJob(job, "complete");
		const timestamp = now();
		db.prepare(
			`UPDATE background_jobs
			 SET status = 'completed',
			     result_json = ?,
			     completed_at = ?,
			     locked_at = NULL,
			     locked_by = NULL,
			     updated_at = ?
			 WHERE job_id = ?`,
		).run(JSON.stringify(result), timestamp, timestamp, jobId);
		return get(jobId);
	};

	const fail = (jobId: string, error: Error | string): BackgroundJob | null => {
		const job = get(jobId);
		if (!job || job.status === "cancelled") {
			// Silently ignore cancellation.
			return job;
		}
		const current = assertRunningJob(job, "fail");

		const message = typeof error === "string" ? error : error.message;
		const retryCount = current.retryCount + 1;
		const timestamp = now();
		const shouldRetry = retryCount < current.maxAttempts;
		const delay = retryDelaysMs[Math.min(retryCount - 1, retryDelaysMs.length - 1)] ?? 0;
		const nextRetryAt = shouldRetry ? timestamp + delay : null;

		db.prepare(
			`UPDATE background_jobs
			 SET status = ?,
			     retry_count = ?,
			     last_error = ?,
			     run_after = ?,
			     next_retry_at = ?,
			     locked_at = NULL,
			     locked_by = NULL,
			     updated_at = ?
			 WHERE job_id = ?`,
		).run(
			shouldRetry ? "pending" : "failed",
			retryCount,
			message,
			nextRetryAt,
			nextRetryAt,
			timestamp,
			jobId,
		);

		if (!shouldRetry && current.notifyOnFailure) {
			db.prepare(
				`INSERT INTO notification_events(
					event_id, event_type, severity, title, body,
					payload_json, status, created_at, read_at
				) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				`notification-${crypto.randomUUID()}`,
				"background_job.failed",
				"error",
				"后台任务失败",
				message,
				JSON.stringify({ jobId }),
				"unread",
				timestamp,
				null,
			);
		}

		return get(jobId);
	};

	/**
	 * Cancel jobs matching the given filter.
	 * - pending/failed jobs are deleted.
	 * - running jobs are marked 'cancelled' so their workers gracefully stop.
	 * Returns the number of jobs cancelled.
	 */
	const cancel = (filter: CancelBackgroundJobFilter): number => {
		const timestamp = now();
		const conditions: string[] = ["job_type = ?"];
		const params: (string | number | null)[] = [filter.type];

		if (filter.relatedType) {
			conditions.push("related_type = ?");
			params.push(filter.relatedType);
		}
		if (filter.relatedId) {
			conditions.push("related_id = ?");
			params.push(filter.relatedId);
		}

		const where = conditions.join(" AND ");

		// Delete pending / failed jobs outright.
		db.prepare(
			`DELETE FROM background_jobs
			 WHERE ${where}
			   AND status IN ('pending', 'failed')`,
		).run(...params);

		// Mark running jobs as cancelled so workers skip complete/fail.
		db.prepare(
			`UPDATE background_jobs
			 SET status = 'cancelled',
			     updated_at = ?
			 WHERE ${where}
			   AND status = 'running'`,
		).run(timestamp, ...params);

		const result = db.prepare(
			`SELECT COUNT(*) as count FROM background_jobs WHERE ${where} AND status = 'cancelled'`
		).get(...params) as { count: number } | undefined;
		return result?.count ?? 0;
	};

	return {
		claimNext,
		complete,
		enqueue,
		fail,
		get,
		list,
		cancel,
	};
};
