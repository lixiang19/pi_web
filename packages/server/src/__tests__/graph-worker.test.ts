import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { createBackgroundJobQueue } from "../background-jobs.js";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createRagWorker } from "../rag-worker.js";

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

describe("RAG and graph nightly worker chain", () => {
	it("runs graph maintenance after the nightly deferred RAG pass", async () => {
		const db = createDb();
		const jobQueue = createBackgroundJobQueue(db);
		const calls: string[] = [];
		const worker = createRagWorker({
			jobQueue,
			workspaceDir: "/tmp/ridge-workspace",
			indexAllPendingFn: async (options) => {
				const resolved = options ?? {};
				calls.push(`rag:${resolved.includeDeferred ? "deferred" : "immediate"}:${resolved.event ?? ""}`);
				return { processed: 1, succeeded: 1, failed: 0 };
			},
			graphRunner: {
				runNightlyOnce: async () => {
					calls.push("graph");
					return { sources: 1, entities: 1, relations: 1 };
				},
			},
		});

		await worker.runNightlyOnce();

		expect(calls).toEqual(["rag:deferred:nightly", "graph"]);
		db.close();
	});
});
