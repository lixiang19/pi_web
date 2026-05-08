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

		for (const directory of ["收件箱", "日记", "笔记", "项目", "阅读", "数据库"]) {
			const stat = await fs.stat(path.join(workspaceDir, directory));
			expect(stat.isDirectory()).toBe(true);
		}
	});
});
