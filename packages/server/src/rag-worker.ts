import { indexPendingTarget, indexAllPending } from "./rag-indexer.js";
import type { createBackgroundJobQueue } from "./background-jobs.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

export interface RagWorkerOptions {
	jobQueue: BackgroundJobQueue;
	pollIntervalMs?: number;
	compensationScanMs?: number;
}

export function createRagWorker(options: RagWorkerOptions) {
	const {
		jobQueue,
		pollIntervalMs = 5000,
		compensationScanMs = 30000,
	} = options;

	let timer: NodeJS.Timeout | null = null;
	let compensationTimer: NodeJS.Timeout | null = null;
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
	}

	async function processOne(
		job: ReturnType<typeof jobQueue.claimNext> & {},
	): Promise<void> {
		const payload = job.payload as
			| { targetPath?: string }
			| undefined;
		const targetPath = payload?.targetPath ?? job.relatedId;
		if (!targetPath || typeof targetPath !== "string") {
			jobQueue.fail(job.jobId, new Error("Missing targetPath in RAG job payload"));
			return;
		}

		const result = await indexPendingTarget(targetPath);
		if (result.success) {
			jobQueue.complete(job.jobId, { indexed: result.indexed });
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
			await indexAllPending();
		} catch (error) {
			console.error("RAG compensation scan error:", error);
		}
		if (running) {
			compensationTimer = setTimeout(compensationTick, compensationScanMs);
		}
	}

	function start() {
		if (running) return;
		running = true;
		void tick();
		// Start compensation scan for any pending entries that may not have jobs
		void compensationTick();
	}

	return { start, stop, processOne };
}
