import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceVersionRouter } from "../routes/workspace-version.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	for (const targetPath of cleanupDirs.splice(0)) {
		await fs.rm(targetPath, { recursive: true, force: true });
	}
});

function createTestApp(defaultWorkspaceDir: string) {
	const app = express();
	app.use(express.json());
	app.use("/api/workspace/version", createWorkspaceVersionRouter({ defaultWorkspaceDir }));
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

describe("workspace version router", () => {
	it("commits workspace version points and exposes the next diff without Git remotes or branches", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-version-router-"));
		cleanupDirs.push(workspaceDir);
		await fs.mkdir(path.join(workspaceDir, "笔记"), { recursive: true });
		const notePath = path.join(workspaceDir, "笔记", "one.md");
		await fs.writeFile(notePath, "# one\n", "utf-8");

		const app = createTestApp(workspaceDir);

		const firstCommit = await request(app)
			.post("/api/workspace/version/commit")
			.send({ root: workspaceDir, message: "保存笔记", files: [notePath] })
			.expect(200);

		expect(firstCommit.body.ok).toBe(true);
		expect(firstCommit.body.hash).toHaveLength(12);

		await fs.writeFile(notePath, "# one\n\nchanged\n", "utf-8");

		const status = await request(app)
			.get("/api/workspace/version/status")
			.query({ root: workspaceDir })
			.expect(200);

		expect(status.body.current).toBe("main");
		expect(status.body.ahead).toBe(0);
		expect(status.body.behind).toBe(0);
		expect(status.body.files).toEqual([
			{ path: "笔记/one.md", index: " ", working_dir: "M" },
		]);

		const diff = await request(app)
			.get("/api/workspace/version/diff")
			.query({ root: workspaceDir, filePath: "笔记/one.md" })
			.expect(200);

		expect(diff.body.path).toBe("笔记/one.md");
		expect(diff.body.diff).toContain("--- a/笔记/one.md");
		expect(diff.body.diff).toContain("+++ b/笔记/one.md");
		expect(diff.body.diff).toContain("+changed");
	});
});
