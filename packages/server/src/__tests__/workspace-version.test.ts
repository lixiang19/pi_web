import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createIsoGitService } from "../iso-git-service.js";
import { commitWorkspaceVersionPoint, getWorkspaceVersionContext } from "../workspace-version.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	for (const targetPath of cleanupDirs.splice(0)) {
		await fs.rm(targetPath, { recursive: true, force: true });
	}
});

describe("workspace hidden version points", () => {
	it("creates a clean hidden version point for space index html changes", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-workspace-version-"));
		cleanupDirs.push(workspaceDir);
		await fs.mkdir(path.join(workspaceDir, "空间", "demo"), { recursive: true });
		const indexPath = path.join(workspaceDir, "空间", "demo", "index.html");
		await fs.writeFile(indexPath, "<h1>demo</h1>", "utf-8");

		const result = await commitWorkspaceVersionPoint({
			workspaceDir,
			files: [indexPath],
			message: "保存空间作品 demo",
		});

		expect(result.hash).toHaveLength(12);
		const ctx = getWorkspaceVersionContext(workspaceDir);
		const status = await createIsoGitService().getStatus(ctx);
		expect(status.files).toEqual([]);
	});

	it("ignores macOS metadata when creating workspace version points", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-workspace-version-"));
		cleanupDirs.push(workspaceDir);
		const dsStorePath = path.join(workspaceDir, ".DS_Store");
		await fs.writeFile(dsStorePath, "metadata", "utf-8");

		const result = await commitWorkspaceVersionPoint({
			workspaceDir,
			files: [dsStorePath],
			message: "保存系统元数据",
		});

		expect(result).toEqual({ hash: null, files: [] });
		const ctx = getWorkspaceVersionContext(workspaceDir);
		const status = await createIsoGitService().getStatus(ctx);
		expect(status.files).toEqual([]);
	});
});
