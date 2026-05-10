import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ensureWorkspaceTemplate,
	resolveDefaultWorkspaceDir,
} from "../workspace-chat.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupDirs.splice(0).map((targetPath) =>
			fs.rm(targetPath, { recursive: true, force: true }),
		),
	);
});

describe("resolveDefaultWorkspaceDir", () => {
	it("uses the managed default workspace when no workspace is stored", () => {
		const homeDir = path.join("tmp", "ridge-home");

		expect(
			resolveDefaultWorkspaceDir({
				homeDir,
			}),
		).toBe(path.resolve(homeDir, "ridge-workspace"));
	});

	it("uses the workspace stored in ridge db", () => {
		expect(
			resolveDefaultWorkspaceDir({
				homeDir: "/home/ridge",
				storedWorkspaceDir: "/data/workspace",
			}),
		).toBe("/data/workspace");
	});

	it("creates the initial workspace template", async () => {
		const workspaceDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "ridge-workspace-template-"),
		);
		cleanupDirs.push(workspaceDir);

		await ensureWorkspaceTemplate(workspaceDir);

		for (const directory of [
			"项目",
			"笔记",
			"日记",
			"剪藏",
			"附件",
			"记忆",
			"Wiki",
			"空间",
			".ridge",
		]) {
			const stat = await fs.stat(path.join(workspaceDir, directory));
			expect(stat.isDirectory()).toBe(true);
		}
		for (const directory of [
			"fleeting-attachments",
			"rag",
			"graph.kuzu",
			"cache",
			"runtime",
		]) {
			const stat = await fs.stat(path.join(workspaceDir, ".ridge", directory));
			expect(stat.isDirectory()).toBe(true);
		}

		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.toBe("# MEMORY\n");
		await expect(
			fs.readFile(path.join(workspaceDir, "Wiki", "index.md"), "utf8"),
		).resolves.toBe("# Wiki\n");
	});

	it("does not overwrite existing workspace memory and wiki files", async () => {
		const workspaceDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "ridge-workspace-idempotent-"),
		);
		cleanupDirs.push(workspaceDir);

		await ensureWorkspaceTemplate(workspaceDir);
		await fs.writeFile(
			path.join(workspaceDir, "记忆", "MEMORY.md"),
			"# MEMORY\n\n用户保留内容\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(workspaceDir, "Wiki", "index.md"),
			"# Wiki\n\n用户保留内容\n",
			"utf8",
		);

		await ensureWorkspaceTemplate(workspaceDir);

		await expect(
			fs.readFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "utf8"),
		).resolves.toBe("# MEMORY\n\n用户保留内容\n");
		await expect(
			fs.readFile(path.join(workspaceDir, "Wiki", "index.md"), "utf8"),
		).resolves.toBe("# Wiki\n\n用户保留内容\n");
	});

	it("fails when the workspace path is a file", async () => {
		const parentDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "ridge-workspace-file-parent-"),
		);
		cleanupDirs.push(parentDir);
		const workspaceDir = path.join(parentDir, "workspace");
		await fs.writeFile(workspaceDir, "not a directory", "utf8");

		await expect(ensureWorkspaceTemplate(workspaceDir)).rejects.toThrow(
			/Workspace path exists but is not a directory/,
		);
	});

	it("fails when a reserved workspace directory path is a file", async () => {
		const workspaceDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "ridge-workspace-reserved-file-"),
		);
		cleanupDirs.push(workspaceDir);
		await fs.writeFile(path.join(workspaceDir, "项目"), "not a directory", "utf8");

		await expect(ensureWorkspaceTemplate(workspaceDir)).rejects.toThrow(
			/Workspace template path exists but is not a directory/,
		);
	});
});
