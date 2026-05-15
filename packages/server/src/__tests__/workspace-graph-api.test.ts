import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	app,
	resetModuleStateForTests,
	setGraphRunnerForTesting,
} from "../index.js";
import type { GraphMaintenanceRunner } from "../graph-agent.js";
import { createAuthenticatedAgent } from "../test/auth.js";

let api: ReturnType<typeof request.agent>;

beforeEach(async () => {
	resetModuleStateForTests();
	api = await createAuthenticatedAgent(app);
});

afterEach(() => {
	resetModuleStateForTests();
});

describe("POST /api/workspace/graph/corrections", () => {
	it("requires API authentication", async () => {
		const res = await request(app)
			.post("/api/workspace/graph/corrections")
			.send({ correction: "Alpha 是 Concept" });

		expect(res.status).toBe(401);
	});

	it("returns 503 when graph maintenance is not initialized", async () => {
		const res = await api
			.post("/api/workspace/graph/corrections")
			.send({ correction: "Alpha 是 Concept" });

		expect(res.status).toBe(503);
		expect(res.text).toContain("图谱维护服务尚未初始化");
	});

	it("applies natural-language corrections through the graph runner", async () => {
		const runner: GraphMaintenanceRunner = {
			runNightlyOnce: vi.fn(async () => ({ sources: 0, entities: 0, relations: 0 })),
			applyNaturalLanguageCorrection: vi.fn(async () => ({
				sources: 1,
				entities: 1,
				relations: 1,
			})),
		};
		setGraphRunnerForTesting(runner);

		const res = await api
			.post("/api/workspace/graph/corrections")
			.send({ correction: "Alpha 是 Concept，不是 Person" });

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ sources: 1, entities: 1, relations: 1 });
		expect(runner.applyNaturalLanguageCorrection).toHaveBeenCalledWith(
			"Alpha 是 Concept，不是 Person",
		);
	});
});
