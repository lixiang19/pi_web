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

describe("RAG, graph and Wiki nightly worker chain", () => {
	it("runs graph and Wiki maintenance after the nightly deferred RAG pass", async () => {
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
			wikiRunner: {
				runNightlyOnce: async () => {
					calls.push("wiki");
					return { sources: 1, pagesWritten: 1, pagesDeleted: 0 };
				},
			},
		});

		await worker.runNightlyOnce();

		expect(calls).toEqual(["rag:deferred:nightly", "graph", "wiki", "rag:immediate:nightly"]);
		db.close();
	});
});
