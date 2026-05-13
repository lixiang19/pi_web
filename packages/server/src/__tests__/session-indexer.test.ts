import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { getRidgeDb } from "../db/index.js";
import {
	invalidateManagedProjectScopes,
	refreshSessionCatalog,
	listIndexedSessionContexts,
	listIndexedSessions,
} from "../session-indexer.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

beforeEach(async () => {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM projects").run();
	db.prepare("DELETE FROM session_index").run();
	db.prepare("DELETE FROM session_contexts").run();
	db.prepare("DELETE FROM sessions").run();
	invalidateManagedProjectScopes();
});

const workspaceChatConfig = {
	workspaceDir: WORKSPACE,
	chatProjectId: "ridge:workspace-chat",
	chatProjectPath: WORKSPACE,
	chatProjectLabel: "Chat",
};

const projectContextResolver = {
	resolveContext: async (cwd: string) => ({
		isGit: false,
		projectId: cwd,
		projectRoot: cwd,
		projectLabel: path.basename(cwd),
		worktreeRoot: cwd,
		worktreeLabel: path.basename(cwd),
		branch: undefined,
		worktrees: [{ path: cwd, branch: undefined, label: path.basename(cwd) }],
	}),
	isPathInsideRoot: (candidate: string, root: string) => {
		const relative = path.relative(root, candidate);
		return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
	},
};

describe("session indexer — refreshSessionCatalog internal project exclusion", () => {
	it("external repo session gets its own context projectId after refresh", async () => {
		const repoDir = path.join(WORKSPACE, `refresh-repo-${Date.now()}`);
		await fs.mkdir(repoDir, { recursive: true });

		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-refresh-external",
			"refresh-external",
			repoDir,
			0,
			Date.now(),
			"external",
			"folder",
			WORKSPACE,
			Date.now(),
		);

		invalidateManagedProjectScopes();

		// Mock SessionManager.listAll to return a fake session at repoDir
		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const originalListAll = SessionManager.listAll;
		SessionManager.listAll = vi.fn(async () => [
			{
				id: `refresh-sess-${Date.now()}`,
				name: "Refresh Test Session",
				cwd: repoDir,
				path: "/tmp/refresh-session.json",
				created: new Date(),
				modified: new Date(),
			},
		]);

		try {
			await refreshSessionCatalog({
				projectContextResolver,
				activeSessions: new Map(),
				workspaceChatConfig,
			});

			const contexts = await listIndexedSessionContexts();
			const repoContext = Object.values(contexts).find(
				(ctx) => ctx.projectId === "proj-refresh-external",
			);
			expect(repoContext).toBeDefined();
			expect(repoContext?.projectRoot).toBe(repoDir);

			// Also verify the session is in the catalog
			const sessions = await listIndexedSessions(new Map());
			expect(sessions.length).toBeGreaterThanOrEqual(1);
		} finally {
			SessionManager.listAll = originalListAll;
		}

		await fs.rm(repoDir, { recursive: true, force: true });
	});

	it("internal project path session is not attributed to internal project (falls back to workspace or dropped)", async () => {
		const internalPath = path.join(WORKSPACE, "项目", `refresh-internal-${Date.now()}`);
		await fs.mkdir(internalPath, { recursive: true });

		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"proj-refresh-internal",
			"refresh-internal",
			internalPath,
			0,
			Date.now(),
			"internal",
			null,
			WORKSPACE,
			Date.now(),
		);

		invalidateManagedProjectScopes();

		const { SessionManager } = await import("@mariozechner/pi-coding-agent");
		const originalListAll = SessionManager.listAll;
		const sessionId = `refresh-sess-internal-${Date.now()}`;
		SessionManager.listAll = vi.fn(async () => [
			{
				id: sessionId,
				name: "Internal Path Session",
				cwd: internalPath,
				path: "/tmp/internal-session.json",
				created: new Date(),
				modified: new Date(),
			},
		]);

		try {
			await refreshSessionCatalog({
				projectContextResolver,
				activeSessions: new Map(),
				workspaceChatConfig,
			});

			const contexts = await listIndexedSessionContexts();
			// Internal project should NOT create its own context entry
			const internalContext = Object.values(contexts).find(
				(ctx) => ctx.projectId === "proj-refresh-internal",
			);
			expect(internalContext).toBeUndefined();

			// Since internalPath is inside workspace, it falls back to workspace-chat scope
			// The session should exist in the catalog with workspace context
			const sessions = await listIndexedSessions(new Map());
			const internalSession = sessions.find((s) => s.id === sessionId);
			expect(internalSession).toBeDefined();
			// The session's contextId should map to workspace-chat context, not internal project
			const sessionContext = contexts[internalSession?.contextId ?? ""];
			expect(sessionContext).toBeDefined();
			expect(sessionContext?.projectId).not.toBe("proj-refresh-internal");
		} finally {
			SessionManager.listAll = originalListAll;
		}

		await fs.rm(internalPath, { recursive: true, force: true });
	});
});
