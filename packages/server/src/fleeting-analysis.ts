export interface FleetingAnalysisQueueOptions {
	maxAttempts?: number;
	retryDelayMs?: number;
	runAnalysis: (noteId: string, attempt: number) => Promise<void>;
}

interface QueueItem {
	noteId: string;
	attempt: number;
}

export function createFleetingAnalysisQueue(options: FleetingAnalysisQueueOptions) {
	const maxAttempts = options.maxAttempts ?? 3;
	const retryDelayMs = options.retryDelayMs ?? 3000;
	const pending: QueueItem[] = [];
	const queuedIds = new Set<string>();
	let running = false;

	const schedule = (item: QueueItem, delayMs = 0) => {
		if (queuedIds.has(item.noteId)) return;
		queuedIds.add(item.noteId);
		const enqueue = () => {
			pending.push(item);
			void drain();
		};
		if (delayMs > 0) {
			setTimeout(enqueue, delayMs);
		} else {
			enqueue();
		}
	};

	const drain = async () => {
		if (running) return;
		running = true;
		try {
			while (pending.length > 0) {
				const item = pending.shift()!;
				queuedIds.delete(item.noteId);
				try {
					await options.runAnalysis(item.noteId, item.attempt);
				} catch {
					if (item.attempt < maxAttempts) {
						schedule(
							{ noteId: item.noteId, attempt: item.attempt + 1 },
							retryDelayMs,
						);
					}
				}
			}
		} finally {
			running = false;
		}
	};

	return {
		enqueue(noteId: string) {
			schedule({ noteId, attempt: 1 });
		},
		get size() {
			return pending.length + (running ? 1 : 0);
		},
	};
}
