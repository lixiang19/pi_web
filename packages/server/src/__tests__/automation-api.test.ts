import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCoreRouter } from "../routes/core.js";
import type { AutomationStore } from "../automations.js";
import { _testOnlySessionPayload } from "../session-payload.js";

const createApp = (deps: Parameters<typeof createCoreRouter>[0]) => {
	const app = express();
	app.use(express.json());
	app.use(createCoreRouter(deps));
	app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
		res.status(err.statusCode ?? 500).json({ error: err.message });
	});
	return app;
};

describe("createCoreRouter automation routes with mock store", () => {
	const mockStore = {
		listRules: vi.fn(() => [{ id: "rule-1", name: "Test Rule" }]),
		createRule: vi.fn((_input) => ({ id: "new-rule", ..._input })),
		getRule: vi.fn((_id) => ({ id: _id, name: "Test Rule", enabled: true })),
		updateRule: vi.fn((_id, patch) => ({ id: _id, ...patch })),
		removeRule: vi.fn((_id) => true),
	} as unknown as AutomationStore;

	const mockScheduler = {
		reschedule: vi.fn(),
	};

	const mockDispatch = vi.fn(async (rule) => ({ sessionId: `session-${rule.id}` }));

	const baseDeps = {
		defaultWorkspaceDir: "/tmp/workspace",
		resolveDiscoveryCwd: (value: unknown) => String(value ?? "/tmp/workspace"),
		listProviders: () => [],
		discoverAgents: async () => [],
		createAgentSummary: (agent: any) => agent,
		createAgentConfigResponse: (agent: any) => agent,
		getAgentByName: async () => null,
		saveAgent: async () => ({} as any),
		deleteAgent: async () => "ok",
		getAutomationStore: () => mockStore,
		getAutomationScheduler: () => mockScheduler,
		dispatchAutomationRule: mockDispatch,
		ensureManagedProjectScope: async () => undefined,
		ensureSessionRecord: async () => ({ id: "s-1" } as any),
		buildResourceCatalog: () => ({ prompts: [], skills: [], commands: [], diagnostics: [] }) as any,
		createTransientCatalogSession: async () => ({ session: {} as any, resourceLoader: {} as any }),
		fileManager: {} as any,
		normalizeString: (v: unknown) => String(v ?? "").trim(),
		toPosixPath: (p: string) => p,
		agentScopeQuerySchema: { parse: () => ({}) },
		agentUpsertSchema: { parse: () => ({}) },
		automationRuleInputSchema: { parse: (data: unknown) => data as any },
		automationRulePatchSchema: { parse: (data: unknown) => data as any },
		automationToggleSchema: { parse: () => ({ enabled: true }) },
		resourceCatalogQuerySchema: { parse: () => ({}) },
		fileTreeQuerySchema: { parse: () => ({}) },
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("GET /api/automations calls getter and returns rules", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).get("/api/automations");
		expect(res.status).toBe(200);
		expect(res.body.rules).toEqual([{ id: "rule-1", name: "Test Rule" }]);
		expect(mockStore.listRules).toHaveBeenCalledTimes(1);
	});

	it("POST /api/automations creates rule and calls reschedule", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).post("/api/automations").send({
			name: "auto-rule",
			cwd: "/tmp/workspace",
			enabled: false,
			schedule: { type: "interval", everyMinutes: 9999 },
		});
		expect(res.status).toBe(201);
		expect(mockStore.createRule).toHaveBeenCalledTimes(1);
		expect(mockScheduler.reschedule).toHaveBeenCalledTimes(1);
	});

	it("toggle calls updateRule and reschedule", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).post("/api/automations/r-1/toggle").send({ enabled: true });
		expect(res.status).toBe(200);
		expect(mockStore.updateRule).toHaveBeenCalledWith("r-1", { enabled: true });
		expect(mockScheduler.reschedule).toHaveBeenCalledTimes(1);
	});

	it("delete calls removeRule and reschedule", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).delete("/api/automations/r-1");
		expect(res.status).toBe(200);
		expect(mockStore.removeRule).toHaveBeenCalledWith("r-1");
		expect(mockScheduler.reschedule).toHaveBeenCalledTimes(1);
	});

	it("run-now calls getRule then dispatchAutomationRule", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).post("/api/automations/r-1/run");
		expect(res.status).toBe(200);
		expect(mockStore.getRule).toHaveBeenCalledWith("r-1");
		expect(mockDispatch).toHaveBeenCalledTimes(1);
	});
});

describe("getAutomationStore delegated from session-payload (no global deps pollution)", () => {
	it("reads store through deps without recursive self-call", async () => {
		const { getAutomationStore } = await import("../session-payload.js");

		const mockStore = {
			listRules: vi.fn(() => [{ id: "mock-rule" }]),
		} as unknown as AutomationStore;

		const original = _testOnlySessionPayload.snapshotDeps();
		try {
			_testOnlySessionPayload.restoreDeps({
				...original,
				getAutomationStore: () => mockStore,
			});

			const store = getAutomationStore();
			expect(store).toBe(mockStore);
			expect(store.listRules()).toEqual([{ id: "mock-rule" }]);
		} finally {
			_testOnlySessionPayload.restoreDeps(original);
		}
	});
});

describe("index.ts automation getter wiring", () => {
	it("returns 503 when automationStore is not initialized (test mode without startServer)", async () => {
		const { app } = await import("../index.js");
		const { createAuthenticatedAgent } = await import("../test/auth.js");
		const api = await createAuthenticatedAgent(app);
		const res = await api.get("/api/automations");
		expect(res.status).toBe(503);
	});
});
