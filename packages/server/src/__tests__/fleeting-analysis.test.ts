import { describe, expect, it, vi } from "vitest";
import { createFleetingAnalysisQueue } from "../fleeting-analysis.js";

describe("fleeting analysis queue", () => {
	it("runs jobs sequentially", async () => {
		const order: string[] = [];
		const queue = createFleetingAnalysisQueue({
			runAnalysis: async (noteId) => {
				order.push(`start:${noteId}`);
				await Promise.resolve();
				order.push(`end:${noteId}`);
			},
		});

		queue.enqueue("a");
		queue.enqueue("b");
		await vi.waitFor(() => expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]));
	});

	it("retries failed jobs", async () => {
		vi.useFakeTimers();
		let calls = 0;
		const queue = createFleetingAnalysisQueue({
			retryDelayMs: 50,
			runAnalysis: async () => {
				calls++;
				if (calls === 1) throw new Error("temporary");
			},
		});

		queue.enqueue("a");
		await vi.waitFor(() => expect(calls).toBe(1));
		await vi.advanceTimersByTimeAsync(50);
		await vi.waitFor(() => expect(calls).toBe(2));
		vi.useRealTimers();
	});
});
