import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
	buildServerBackupPlan,
	createServerBackupArchive,
} from "../workspace-backup.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		cleanupDirs.splice(0).map((targetPath) =>
			fs.rm(targetPath, { recursive: true, force: true }),
		),
	);
});

describe("server backup plan", () => {
	it("includes Kuzu graph storage and excludes rebuildable ridge caches", () => {
		const plan = buildServerBackupPlan({
			workspaceDir: "/tmp/ridge-workspace",
			ridgeDbPath: "/tmp/.pi/ridge.db",
		});

		expect(plan.includePaths).toContain("/tmp/.pi/ridge.db");
		expect(plan.includePaths).toContain("/tmp/ridge-workspace");
		expect(plan.includePaths).toContain(path.join("/tmp/ridge-workspace", ".ridge", "graph.kuzu"));
		expect(plan.excludePaths).toEqual(
			expect.arrayContaining([
				path.join("/tmp/ridge-workspace", ".ridge", "rag"),
				path.join("/tmp/ridge-workspace", ".ridge", "cache"),
				path.join("/tmp/ridge-workspace", ".ridge", "runtime"),
				path.join("/tmp/ridge-workspace", ".ridge", "fleeting-attachments"),
			]),
		);
		expect(plan.excludePaths).not.toContain(path.join("/tmp/ridge-workspace", ".ridge", "graph.kuzu"));
	});

	it("creates a zip archive that includes graph storage and excludes rebuildable caches", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-backup-workspace-"));
		const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-backup-data-"));
		cleanupDirs.push(workspaceDir, dataDir);
		const ridgeDbPath = path.join(dataDir, "ridge.db");

		await fs.writeFile(ridgeDbPath, "sqlite-bytes", "utf-8");
		await fs.mkdir(path.join(workspaceDir, ".ridge", "graph.kuzu"), { recursive: true });
		await fs.mkdir(path.join(workspaceDir, ".ridge", "rag"), { recursive: true });
		await fs.writeFile(
			path.join(workspaceDir, ".ridge", "graph.kuzu", "schema.cypher"),
			"CREATE NODE TABLE Project",
			"utf-8",
		);
		await fs.writeFile(
			path.join(workspaceDir, ".ridge", "rag", "chunk-cache.json"),
			"rebuildable",
			"utf-8",
		);

		const archive = await createServerBackupArchive({
			workspaceDir,
			ridgeDbPath,
			now: () => new Date("2026-05-15T00:00:00.000Z"),
		});
		const zip = await JSZip.loadAsync(archive.buffer);

		expect(zip.file("server/ridge.db")).not.toBeNull();
		expect(zip.file("workspace/.ridge/graph.kuzu/schema.cypher")).not.toBeNull();
		expect(zip.file("workspace/.ridge/rag/chunk-cache.json")).toBeNull();
		expect(zip.file("backup-manifest.json")).not.toBeNull();
		expect(archive.fileName).toBe("ridge-backup-2026-05-15T00-00-00-000Z.zip");
	});

	it("does not follow workspace symlinks into external files", async () => {
		const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-backup-workspace-"));
		const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-backup-data-"));
		const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-backup-external-"));
		cleanupDirs.push(workspaceDir, dataDir, externalDir);
		const ridgeDbPath = path.join(dataDir, "ridge.db");
		const externalFile = path.join(externalDir, "secret.md");

		await fs.writeFile(ridgeDbPath, "sqlite-bytes", "utf-8");
		await fs.writeFile(externalFile, "external-secret", "utf-8");
		await fs.symlink(externalFile, path.join(workspaceDir, "linked-secret.md"));

		const archive = await createServerBackupArchive({
			workspaceDir,
			ridgeDbPath,
			now: () => new Date("2026-05-15T00:00:00.000Z"),
		});
		const zip = await JSZip.loadAsync(archive.buffer);

		expect(zip.file("workspace/linked-secret.md")).toBeNull();
		expect(await zip.file("server/ridge.db")?.async("string")).toBe("sqlite-bytes");
	});
});
