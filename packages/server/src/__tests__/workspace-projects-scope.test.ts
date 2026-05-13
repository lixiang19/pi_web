import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import express from "express";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getRidgeDb, resetRidgeDb } from "../db/index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import {
	createWorkspaceTasksRouter,
	createWorkspaceMilestonesRouter,
	type WorkspaceTasksRouterDeps,
} from "../routes/workspace-tasks.js";
import { getProjects } from "../storage/index.js";
import type {
	SessionRecord,
	SessionSnapshot,
	ThinkingLevel,
} from "../types/index.js";

// ============================================================================
// Unit-test deps: avoid real pi-coding-agent createAgentSession / model loading
// ============================================================================
const createMockDeps = (): WorkspaceTasksRouterDeps => ({
	createSessionRecord: vi.fn(async (params) => ({
		id: `session-${Date.now()}`,
		cwd: params.cwd,
		sessionFile: `/tmp/session-${Date.now()}.json`,
		status: "idle",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		session: {} as unknown as SessionRecord["session"],
		settingsManager: {} as unknown,
		resourceLoader: {} as unknown,
		unsubscribe: null,
		clients: new Set(),
		defaultToolNames: [],
		pendingAskRecords: new Map(),
		pendingPermissionRecords: new Map(),
		runtimePermissionRules: {},
		selectedAgentName: undefined,
		selectedAgentConfig: null,
		selectedAgentSignature: "",
		explicitModelSpec: undefined,
		explicitThinkingLevel: undefined,
		resolvedModelSpec: undefined,
		resolvedThinkingLevel: undefined,
		selectedPermissionPolicy: null,
		turnBudget: { maxTurns: undefined, usedTurns: 0, exhausted: false },
	}) as unknown as SessionRecord),
	applyTaskSessionAgentSelection: vi.fn(async () => {}),
	persistSessionRecordMetadata: vi.fn(async () => {}),
	upsertIndexedSessionRecord: vi.fn(async () => {}),
	toSessionSnapshot: vi.fn(async (record) => ({
		id: record.id,
		title: "测试会话",
		cwd: record.cwd,
		status: "idle",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		archived: false,
		messages: [],
		historyMeta: { loadedRounds: 0, totalRounds: 0, hasMoreAbove: false, roundWindow: 3 },
		interactiveRequests: [],
		permissionRequests: [],
	} as unknown as SessionSnapshot)),
	getProjects: vi.fn(async () => ({ projects: [] })),
	getDefaultModel: vi.fn(async () => ""),
	getDefaultThinkingLevel: vi.fn(async () => "medium" as ThinkingLevel),
	projectContextResolver: {
		resolveContext: vi.fn(async (cwd) => ({
			isGit: false,
			projectId: "",
			projectRoot: cwd,
			projectLabel: "",
			worktreeRoot: cwd,
			worktreeLabel: "",
			worktrees: [],
		})),
		isPathInsideRoot: vi.fn((candidate, root) =>
			candidate === root || candidate.startsWith(root + path.sep),
		),
		invalidateContext: vi.fn(),
	},
	workspaceChatConfig: {
		workspaceDir: WORKSPACE,
		chatProjectId: "",
		chatProjectPath: "",
		chatProjectLabel: "",
	},
});

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const SCOPE_TEST_ROOT = path.join(os.homedir(), "ridge-scope-test-root");

// ============================================================================
// 400 rejection tests go through real app (no createAgentSession call needed)
// ============================================================================
describe("project scope semantics — rejection through real app", () => {
	let api: ReturnType<typeof request.agent>;

	beforeAll(async () => {
		const { app } = await import("../index.js");
		api = await createAuthenticatedAgent(app);
		await fs.mkdir(WORKSPACE, { recursive: true });
		await fs.mkdir(SCOPE_TEST_ROOT, { recursive: true });
	});

	beforeEach(async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
		db.prepare("DELETE FROM projects").run();
	});

	it("POST /api/sessions rejects internal project path as cwd", async () => {
		const internalProjectPath = path.join(WORKSPACE, "项目", "my-internal");
		await fs.mkdir(internalProjectPath, { recursive: true });

		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-internal-1",
			"my-internal",
			internalProjectPath,
			0,
			Date.now(),
			"internal",
			null,
			WORKSPACE,
			Date.now(),
		);

		const res = await api.post("/api/sessions").send({
			cwd: internalProjectPath,
			title: "内部项目会话",
		});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Internal project cannot be used as a session working directory");

		await fs.rm(internalProjectPath, { recursive: true, force: true });
	});

	it("POST /api/sessions rejects internal project subdirectory as cwd", async () => {
		const internalProjectPath = path.join(WORKSPACE, "项目", "my-internal");
		const subDir = path.join(internalProjectPath, "src");
		await fs.mkdir(subDir, { recursive: true });

		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-internal-2",
			"my-internal",
			internalProjectPath,
			0,
			Date.now(),
			"internal",
			null,
			WORKSPACE,
			Date.now(),
		);

		const res = await api.post("/api/sessions").send({
			cwd: subDir,
			title: "内部项目子目录会话",
		});
		expect(res.status).toBe(400);
		expect(res.text).toContain("Internal project cannot be used as a session working directory");

		await fs.rm(internalProjectPath, { recursive: true, force: true });
	});
});

// ============================================================================
// Task-processing-session cwd assertions use mocked router (fast, strong)
// ============================================================================
describe("project scope semantics — task session cwd", () => {
	beforeEach(async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
		db.prepare("DELETE FROM projects").run();
		vi.clearAllMocks();
	});

	it("task processing session uses workspaceDir when bound to internal project", async () => {
		const internalProjectPath = path.join(WORKSPACE, "项目", "task-internal");
		await fs.mkdir(internalProjectPath, { recursive: true });

		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-task-internal",
			"task-internal",
			internalProjectPath,
			0,
			Date.now(),
			"internal",
			null,
			WORKSPACE,
			Date.now(),
		);

		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => {
			const state = await getProjects();
			return state;
		});

		const router = createWorkspaceTasksRouter(WORKSPACE, deps);
		const testApp = express();
		testApp.use(express.json());
		testApp.use("/api/workspace/tasks", router);
		testApp.use("/api/workspace/milestones", createWorkspaceMilestonesRouter(WORKSPACE));

		const taskRes = await request(testApp).post("/api/workspace/tasks").send({
			title: "内部项目任务",
			priority: "normal",
			acceptanceCriteria: "完成",
			projectId: "proj-task-internal",
		});
		expect(taskRes.status).toBe(201);
		const taskId = taskRes.body.task.id;

		const procRes = await request(testApp).post(`/api/workspace/tasks/${taskId}/processing-session`);
		expect(procRes.status).toBe(201);
		expect(procRes.body.sessionId).toBeTruthy();

		// Strong assertion: internal project binding → cwd = workspaceDir
		expect(deps.createSessionRecord).toHaveBeenCalledWith(
			expect.objectContaining({ cwd: WORKSPACE }),
		);

		await fs.rm(internalProjectPath, { recursive: true, force: true });
	});

	it("task processing session uses external repo path when bound to external repo", async () => {
		const repoDir = path.join(SCOPE_TEST_ROOT, `task-external-repo-${Date.now()}`);
		await fs.mkdir(repoDir, { recursive: true });

		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-task-external",
			"task-external-repo",
			repoDir,
			0,
			Date.now(),
			"external",
			"folder",
			WORKSPACE,
			Date.now(),
		);

		const deps = createMockDeps();
		deps.getProjects = vi.fn(async () => {
			const state = await getProjects();
			return state;
		});

		const router = createWorkspaceTasksRouter(WORKSPACE, deps);
		const testApp = express();
		testApp.use(express.json());
		testApp.use("/api/workspace/tasks", router);
		testApp.use("/api/workspace/milestones", createWorkspaceMilestonesRouter(WORKSPACE));

		const taskRes = await request(testApp).post("/api/workspace/tasks").send({
			title: "外部仓库任务",
			priority: "normal",
			acceptanceCriteria: "完成",
			projectId: "proj-task-external",
		});
		expect(taskRes.status).toBe(201);
		const taskId = taskRes.body.task.id;

		const procRes = await request(testApp).post(`/api/workspace/tasks/${taskId}/processing-session`);
		expect(procRes.status).toBe(201);
		expect(procRes.body.sessionId).toBeTruthy();

		// Strong assertion: external repo binding → cwd = repoDir
		expect(deps.createSessionRecord).toHaveBeenCalledWith(
			expect.objectContaining({ cwd: repoDir }),
		);

		await fs.rm(repoDir, { recursive: true, force: true });
	});
});

// ============================================================================
// DB schema / legacy migration assertions (no pi-coding-agent involved)
// ============================================================================
describe("project scope semantics — DB & migration", () => {
	let api: ReturnType<typeof request.agent>;

	beforeAll(async () => {
		const { app } = await import("../index.js");
		api = await createAuthenticatedAgent(app);
		await fs.mkdir(WORKSPACE, { recursive: true });
	});

	beforeEach(async () => {
		const db = await getRidgeDb();
		db.prepare("DELETE FROM workspace_tasks").run();
		db.prepare("DELETE FROM workspace_milestones").run();
		db.prepare("DELETE FROM projects").run();
	});

	it("legacy source='internal' is migrated to external_origin=NULL via mapProjectRow", async () => {
		const legacyPath = path.join(WORKSPACE, "legacy-internal");
		await fs.mkdir(legacyPath, { recursive: true });
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-legacy-internal",
			"legacy-internal",
			legacyPath,
			0,
			Date.now(),
			"internal",
			"internal",
			WORKSPACE,
			Date.now(),
		);

		const res = await api.get("/api/projects");
		expect(res.status).toBe(200);
		const legacyProject = res.body.projects.find((p: { id: string }) => p.id === "proj-legacy-internal");
		expect(legacyProject).toBeDefined();
		expect(legacyProject.externalOrigin).toBeNull();
		expect(legacyProject.projectType).toBe("internal");

		await fs.rm(legacyPath, { recursive: true, force: true });
	});

	it("legacy source column renamed to external_origin and cleaned up on DB init", async () => {
		const legacyDir = path.join(WORKSPACE, "legacy-source-migration");
		await fs.mkdir(legacyDir, { recursive: true });

		const legacyDbPath = path.join(WORKSPACE, `legacy-${Date.now()}.db`);
		const legacyDb = new Database(legacyDbPath);
		legacyDb.exec(`
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  is_git INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'external',
  source TEXT NOT NULL DEFAULT 'server-folder',
  workspace_path TEXT NOT NULL DEFAULT '',
  archived_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);
`);
		legacyDb.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, source, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-old",
			"old",
			legacyDir,
			0,
			Date.now(),
			"internal",
			"internal",
			WORKSPACE,
			Date.now(),
		);
		legacyDb.close();

		const originalDbPath = process.env.RIDGE_DB_PATH;
		process.env.RIDGE_DB_PATH = legacyDbPath;
		resetRidgeDb();

		const { initializeRidgeDb: initLegacyDb } = await import("../db/index.js");
		const db = await initLegacyDb(WORKSPACE);

		const columns = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
		const columnNames = columns.map((c) => c.name);
		expect(columnNames).toContain("external_origin");
		expect(columnNames).not.toContain("source");

		const row = db.prepare("SELECT external_origin FROM projects WHERE project_id = ?").get("proj-old") as { external_origin: string | null } | undefined;
		expect(row?.external_origin).toBeNull();

		db.close();

		if (originalDbPath) {
			process.env.RIDGE_DB_PATH = originalDbPath;
		} else {
			delete process.env.RIDGE_DB_PATH;
		}
		resetRidgeDb();
		await fs.unlink(legacyDbPath);
		await fs.rm(legacyDir, { recursive: true, force: true });
	});
});
