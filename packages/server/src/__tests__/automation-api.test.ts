import Database from "better-sqlite3";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAutomationStore } from "../automations.js";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createCoreRouter, type CoreDeps } from "../routes/core.js";
import type { AgentSummary, ResourceCatalogResponse, SessionRecord } from "../types/index.js";
import type { AgentSession, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";
import type { AgentConfigInternal } from "../agents.js";
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
		listRuns: vi.fn(() => [{ id: "run-1", automationId: "rule-1", status: "success" }]),
		createRun: vi.fn((input) => ({ id: "run-new", createdAt: 1, ...input })),
		createRunNotification: vi.fn(),
		createRule: vi.fn((_input) => ({ id: "new-rule", ..._input })),
		getProject: vi.fn((_id) => ({ project_id: _id, name: "Desktop Project" })),
		getRule: vi.fn((_id) => ({ id: _id, name: "Test Rule", enabled: true })),
		updateRule: vi.fn((_id, patch) => ({ id: _id, ...patch })),
		removeRule: vi.fn((_id) => true),
	} as unknown as AutomationStore;

	const mockScheduler = {
		reschedule: vi.fn(),
	};

	const mockDispatch = vi.fn(async (rule) => ({ sessionId: `session-${rule.id}` }));

	const baseDeps: CoreDeps = {
		defaultWorkspaceDir: "/tmp/workspace",
		resolveDiscoveryCwd: (value: unknown) => String(value ?? "/tmp/workspace"),
		listProviders: () => [],
		listSessionContexts: async () => ({ ctx: { contextId: "ctx", cwd: "/tmp/workspace" } }),
		discoverAgents: async () => [],
		createAgentSummary: (agent) => agent as unknown as AgentSummary,
		createAgentConfigResponse: (agent) => agent as unknown as Record<string, unknown>,
		getAgentByName: async () => null,
		saveAgent: async () => ({}) as AgentConfigInternal,
		deleteAgent: async () => "ok",
		getAutomationStore: () => mockStore,
		getAutomationScheduler: () => mockScheduler,
		dispatchAutomationRule: mockDispatch,
		ensureManagedProjectScope: async () => undefined,
		ensureSessionRecord: async () => ({ id: "s-1" }) as SessionRecord,
		buildResourceCatalog: () => ({
			prompts: [],
			skills: [],
			commands: [],
			diagnostics: { prompts: [], skills: [], commands: [] },
		}) satisfies ResourceCatalogResponse,
		createTransientCatalogSession: async () => ({
			session: {} as AgentSession,
			resourceLoader: {} as DefaultResourceLoader,
		}),
		fileManager: {} as CoreDeps["fileManager"],
		normalizeString: (v: unknown) => String(v ?? "").trim(),
		toPosixPath: (p: string) => p,
		agentScopeQuerySchema: { parse: () => ({}) },
		agentUpsertSchema: { parse: () => ({}) },
		automationRuleInputSchema: { parse: (data: unknown) => data as ReturnType<CoreDeps["automationRuleInputSchema"]["parse"]> },
		automationRulePatchSchema: { parse: (data: unknown) => data as ReturnType<CoreDeps["automationRulePatchSchema"]["parse"]> },
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
		expect(res.body.runs).toEqual([{ id: "run-1", automationId: "rule-1", status: "success" }]);
		expect(mockStore.listRules).toHaveBeenCalledTimes(1);
		expect(mockStore.listRuns).toHaveBeenCalledTimes(1);
	});

	it("GET /api/session-contexts returns indexed context map", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).get("/api/session-contexts");

		expect(res.status).toBe(200);
		expect(res.body).toEqual({
			ctx: { contextId: "ctx", cwd: "/tmp/workspace" },
		});
	});

	it("POST /api/automations creates rule and calls reschedule", async () => {
		const app = createApp(baseDeps);
		const res = await request(app).post("/api/automations").send({
			name: "auto-rule",
			cwd: "/tmp/workspace",
			enabled: false,
			scope: "workspace",
			schedule: { type: "interval", everyMinutes: 9999 },
		});
		expect(res.status).toBe(201);
		expect(mockStore.createRule).toHaveBeenCalledTimes(1);
		expect(mockScheduler.reschedule).toHaveBeenCalledTimes(1);
	});

	it("POST /api/automations accepts desktop project paths without server cwd validation", async () => {
		const ensureManagedProjectScope = vi.fn(async () => undefined);
		const app = createApp({
			...baseDeps,
			ensureManagedProjectScope,
		});
		const res = await request(app).post("/api/automations").send({
			name: "desktop project rule",
			cwd: "/Users/local/project-on-device",
			enabled: true,
			scope: "project",
			projectId: "project-desktop",
			schedule: { type: "interval", everyMinutes: 30 },
			prompt: "run",
		});
		expect(res.status).toBe(201);
		expect(mockStore.getProject).toHaveBeenCalledWith("project-desktop");
		expect(ensureManagedProjectScope).not.toHaveBeenCalled();
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

describe("automation store run records and project skip rules", () => {
	const createDb = () => {
		const db = new Database(":memory:");
		db.exec(RIDGE_DB_BOOTSTRAP_SQL);
		return db;
	};

	it("persists rule scope, project binding and run records", () => {
		const db = createDb();
		const store = createAutomationStore(db);
		const now = Date.now();
		db.prepare(
			`INSERT INTO projects(
				project_id, name, path, is_git, added_at, project_type, external_origin,
				workspace_path, device_id, archived_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"project-1",
			"Pi Web",
			"/repo/pi_web",
			1,
			now,
			"external",
			"folder",
			"/workspace",
			null,
			null,
			now,
		);

		const rule = store.createRule({
			name: "项目晨报",
			enabled: true,
			scope: "project",
			projectId: "project-1",
			cwd: "/repo/pi_web",
			schedule: { type: "interval", everyMinutes: 30 },
			prompt: "总结项目",
		});
		expect(rule?.scope).toBe("project");
		expect(rule?.projectId).toBe("project-1");
		expect(rule?.projectName).toBe("Pi Web");

		const run = store.createRun({
			automationId: rule!.id,
			status: "success",
			sessionId: "session-1",
		});
		expect(store.listRuns(rule!.id)).toMatchObject([
			{ id: run.id, automationId: rule!.id, status: "success", sessionId: "session-1" },
		]);
	});

	it("resolves offline desktop project automations as skipped and creates notification", () => {
		const db = createDb();
		const store = createAutomationStore(db);
		const now = Date.now();
		db.prepare(
			`INSERT INTO devices(
				device_id, name, device_type, status, capabilities_json, last_seen_at,
				created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("device-1", "MacBook", "desktop", "offline", "{}", now, now, now);
		db.prepare(
			`INSERT INTO projects(
				project_id, name, path, is_git, added_at, project_type, external_origin,
				workspace_path, device_id, archived_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"project-offline",
			"Offline Project",
			"/repo/offline",
			1,
			now,
			"external",
			"folder",
			"/workspace",
			"device-1",
			null,
			now,
		);

		const rule = store.createRule({
			name: "离线项目自动化",
			enabled: true,
			scope: "project",
			projectId: "project-offline",
			cwd: "/repo/offline",
			schedule: { type: "interval", everyMinutes: 15 },
			prompt: "运行",
		});
		const target = store.resolveExecutionTarget(rule!);
		expect(target).toMatchObject({
			status: "skipped",
			reason: "项目设备离线，已跳过本次自动化",
			projectId: "project-offline",
			deviceId: "device-1",
		});

		const run = store.createRun({
			automationId: rule!.id,
			status: "skipped",
			reason: target.status === "ready" ? "" : target.reason,
		});
		store.createRunNotification(rule!, run);

		const notification = db.prepare(
			`SELECT event_type, source, severity, related_type, related_id, actions_json
			   FROM notification_events
			  WHERE related_id = ?`,
		).get(rule!.id) as Record<string, unknown>;
		expect(notification).toMatchObject({
			event_type: "automation.skipped",
			source: "automation",
			severity: "warning",
			related_type: "automation",
			related_id: rule!.id,
		});
		expect(String(notification.actions_json)).toContain("retry");
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
