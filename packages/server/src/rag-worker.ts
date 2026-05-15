import { indexPendingTarget, indexAllPending } from "./rag-indexer.js";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import type { RagIndexEvent } from "./rag-indexer.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

export interface RagWorkerOptions {
	jobQueue: BackgroundJobQueue;
	workspaceDir?: string;
	pollIntervalMs?: number;
	compensationScanMs?: number;
	nightlyHour?: number;
}

export function createRagWorker(options: RagWorkerOptions) {
	const {
		jobQueue,
		workspaceDir,
		pollIntervalMs = 5000,
		compensationScanMs = 30000,
		nightlyHour = 3,
	} = options;

	let timer: NodeJS.Timeout | null = null;
	let compensationTimer: NodeJS.Timeout | null = null;
	let nightlyTimer: NodeJS.Timeout | null = null;
	let running = false;

	function stop() {
		running = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (compensationTimer) {
			clearTimeout(compensationTimer);
			compensationTimer = null;
		}
		if (nightlyTimer) {
			clearTimeout(nightlyTimer);
			nightlyTimer = null;
		}
	}

	async function processOne(
		job: ReturnType<typeof jobQueue.claimNext> & {},
	): Promise<void> {
		const payload = job.payload as
			| { targetPath?: string; workspaceDir?: string; event?: RagIndexEvent }
			| undefined;
		const targetPath = payload?.targetPath ?? job.relatedId;
		if (!targetPath || typeof targetPath !== "string") {
			jobQueue.fail(job.jobId, new Error("Missing targetPath in RAG job payload"));
			return;
		}

		const result = await indexPendingTarget(targetPath, {
			workspaceDir: payload?.workspaceDir,
			event: payload?.event ?? "manual",
		});
		if (result.success) {
			jobQueue.complete(job.jobId, { indexed: result.indexed, skipped: result.skipped === true });
		} else {
			jobQueue.fail(job.jobId, new Error(result.error || "RAG indexing failed"));
		}
	}

	async function tick() {
		if (!running) return;
		try {
			const job = jobQueue.claimNext("rag-worker", "rag.index");
			if (job) {
				await processOne(job);
			}
		} catch (error) {
			console.error("RAG worker tick error:", error);
		}
		if (running) {
			timer = setTimeout(tick, pollIntervalMs);
		}
	}

	async function compensationTick() {
		if (!running) return;
		try {
			await indexAllPending({ workspaceDir });
		} catch (error) {
			console.error("RAG compensation scan error:", error);
		}
		if (running) {
			compensationTimer = setTimeout(compensationTick, compensationScanMs);
		}
	}

	async function runNightlyOnce() {
		return indexAllPending({ workspaceDir, includeDeferred: true, event: "nightly" });
	}

	function delayUntilNextNightlyRun(now = new Date()): number {
		const next = new Date(now);
		next.setHours(nightlyHour, 0, 0, 0);
		if (next.getTime() <= now.getTime()) {
			next.setDate(next.getDate() + 1);
		}
		return next.getTime() - now.getTime();
	}

	async function nightlyTick() {
		if (!running) return;
		try {
			await runNightlyOnce();
		} catch (error) {
			console.error("RAG nightly scan error:", error);
		}
		if (running) {
			nightlyTimer = setTimeout(nightlyTick, delayUntilNextNightlyRun());
		}
	}

	function start() {
		if (running) return;
		running = true;
		void tick();
		// Start compensation scan for any pending entries that may not have jobs
		void compensationTick();
		nightlyTimer = setTimeout(nightlyTick, delayUntilNextNightlyRun());
	}

	return { start, stop, processOne, runNightlyOnce };
}
