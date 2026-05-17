import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGitRouter } from "../routes/git.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	for (const targetPath of cleanupDirs.splice(0)) {
		await fs.rm(targetPath, { recursive: true, force: true });
	}
});

function createTestApp(defaultWorkspaceDir: string) {
	const app = express();
	app.use(express.json());
	app.use(
		"/api/git",
		createGitRouter({
			defaultWorkspaceDir,
			gitService: {
				isGitRepository: vi.fn(),
				getStatus: vi.fn(),
				getBranches: vi.fn(),
				getRemotes: vi.fn(),
				fetch: vi.fn(),
				pull: vi.fn(),
				push: vi.fn(),
				commit: vi.fn(),
				getFileDiff: vi.fn(),
				createBranch: vi.fn(),
				checkoutBranch: vi.fn(),
				renameBranch: vi.fn(),
				merge: vi.fn(),
				rebase: vi.fn(),
			},
		}),
	);
	app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
		const statusCode = typeof error === "object" && error !== null && "statusCode" in error
			? Number((error as { statusCode?: number }).statusCode)
			: 500;
		res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
			error: error instanceof Error ? error.message : String(error),
		});
	});
	return app;
}

describe("git router repository boundary", () => {
	it("does not expose ridge internal version storage as Git for plain directories", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-git-boundary-"));
		cleanupDirs.push(workspaceDir);

		const app = createTestApp(workspaceDir);

		const res = await request(app)
			.get("/api/git/is-repo")
			.query({ cwd: workspaceDir })
			.expect(200);

		expect(res.body).toEqual({
			isRepository: false,
			engine: "none",
			canCommit: false,
			canPushPull: false,
			canWorktree: false,
			label: "非 Git 仓库",
		});
	});
});
