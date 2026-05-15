import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getRidgeDb } from "../db/index.js";
import { markRagTargetPending, indexPendingTarget } from "../rag-indexer.js";
import { searchWorkspace } from "../routes/workspace-search.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "workspace-search-test");
const EXTERNAL_ROOT = path.join(os.tmpdir(), "ridge-search-external-test");

async function cleanDb() {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM workspace_tasks WHERE workspace_path = ?").run(TEST_ROOT);
	db.prepare("DELETE FROM workspace_milestones WHERE workspace_path = ?").run(TEST_ROOT);
	db.prepare("DELETE FROM session_index WHERE workspace_path = ?").run(TEST_ROOT);
	db.prepare("DELETE FROM projects WHERE workspace_path = ? OR path LIKE ?").run(TEST_ROOT, `${EXTERNAL_ROOT}%`);
	db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
}

describe("workspace global search api", () => {
	beforeEach(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.rm(EXTERNAL_ROOT, { recursive: true, force: true });
		await fs.mkdir(path.join(TEST_ROOT, "笔记"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "记忆"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "记忆体"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "Wiki"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "空间", "demo-space"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "空间", "missing-index-space"), { recursive: true });
		await fs.mkdir(path.join(TEST_ROOT, "项目", "internal-alpha"), { recursive: true });
		await fs.mkdir(EXTERNAL_ROOT, { recursive: true });
		await cleanDb();

		await fs.writeFile(path.join(TEST_ROOT, "笔记", "alpha-note.md"), "# Alpha Note\n\nfile-search-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "记忆", "alpha-memory.md"), "# Memory\n\nmemory-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "记忆体", "wrong-memory.md"), "# Memory Body\n\nmemory-token wrong-dir-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "Wiki", "alpha-wiki.md"), "# Wiki\n\nwiki-token", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "空间", "demo-space", "index.html"), "<h1>alpha-space-token</h1>", "utf-8");
		await fs.writeFile(path.join(TEST_ROOT, "项目", "internal-alpha", "spec.md"), "# Internal\n\ninternal-token", "utf-8");
		await fs.writeFile(path.join(EXTERNAL_ROOT, "external.md"), "# External\n\nexternal-token alpha-leak-token", "utf-8");
		await fs.symlink(EXTERNAL_ROOT, path.join(TEST_ROOT, "linked-external"), "dir").catch(() => undefined);

		const ragPath = path.join(TEST_ROOT, "笔记", "alpha-note.md");
		await markRagTargetPending(ragPath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		await indexPendingTarget(ragPath, { workspaceDir: TEST_ROOT });
		const projectRagPath = path.join(TEST_ROOT, "项目", "internal-alpha", "spec.md");
		await markRagTargetPending(projectRagPath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		await indexPendingTarget(projectRagPath, { workspaceDir: TEST_ROOT });

		const now = Date.now();
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO workspace_milestones(
				milestone_id, workspace_path, title, goal, acceptance_criteria, status, due_date,
				is_system, color, sort_order, created_at, updated_at, project_id
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("ms-search", TEST_ROOT, "Alpha Milestone", "ship alpha", "milestone acceptance", "pending", null, 0, "#64748b", 0, now, now, null);
		db.prepare(
			`INSERT INTO workspace_tasks(
				task_id, workspace_path, milestone_id, title, status, priority, acceptance_criteria,
				due_date, blocked_reason, processing_session_id, sort_order, created_at, updated_at, project_id
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("task-search", TEST_ROOT, "ms-search", "Alpha Task", "pending", "normal", "task acceptance token", null, null, null, 0, now, now, null);
		db.prepare(
			`INSERT INTO session_index(
				session_id, title, session_type, context_type, workspace_path, project_id, task_id,
				device_id, run_location, archived, created_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("session-search", "Alpha Session", "workspace", "workspace", TEST_ROOT, null, null, null, "server", 0, now, now);
		db.prepare(
			`INSERT INTO projects(
				project_id, name, path, is_git, added_at, project_type, external_origin,
				workspace_path, device_id, archived_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("project-internal-alpha", "Internal Alpha", path.join(TEST_ROOT, "项目", "internal-alpha"), 0, now, "internal", null, TEST_ROOT, null, null, now);
		db.prepare(
			`INSERT INTO projects(
				project_id, name, path, is_git, added_at, project_type, external_origin,
				workspace_path, device_id, archived_at, updated_at
			) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("project-external-alpha", "External Alpha", EXTERNAL_ROOT, 0, now, "external", "folder", TEST_ROOT, null, null, now);
	});

	afterAll(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.rm(EXTERNAL_ROOT, { recursive: true, force: true });
		await cleanDb();
	});

	it("aggregates deterministic workspace assets without searching external project files", async () => {
		const res = await searchWorkspace({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }, { q: "alpha" });

		const types = new Set(res.results.map((item: { type: string }) => item.type));
		expect(types.has("file")).toBe(true);
		expect(types.has("task")).toBe(true);
		expect(types.has("milestone")).toBe(true);
		expect(types.has("project")).toBe(true);
		expect(types.has("session")).toBe(true);
		expect(types.has("memory")).toBe(true);
		expect(types.has("wiki")).toBe(true);
		expect(types.has("space")).toBe(true);
		expect(types.has("rag")).toBe(true);
		expect(res.results.some((item: { type: string; path?: string }) =>
			["file", "memory", "wiki", "rag"].includes(item.type) && item.path?.includes(EXTERNAL_ROOT),
		)).toBe(false);
		expect(res.indexStatus).toMatchObject({ indexed: 2, pending: 0, indexFailed: 0 });
	});

	it("filters by result type and directory", async () => {
		const typeRes = await searchWorkspace({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }, { q: "Alpha", type: "task" });
		expect(typeRes.results).toHaveLength(1);
		expect(typeRes.results[0]).toMatchObject({ type: "task", title: "Alpha Task" });

		const dirRes = await searchWorkspace({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }, { q: "token", type: "file,rag", dir: "笔记" });
		expect(dirRes.results.length).toBeGreaterThan(0);
		expect(dirRes.results.every((item: { path?: string; sourcePath?: string }) =>
			(item.path ?? item.sourcePath ?? "").startsWith("笔记/"),
		)).toBe(true);
	});

	it("keeps directory filters on path boundaries and skips broken or external file trees", async () => {
		const memoryRes = await searchWorkspace({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }, { q: "memory-token", type: "file,memory", dir: "记忆" });
		expect(memoryRes.results.length).toBeGreaterThan(0);
		expect(memoryRes.results.every((item: { path?: string; sourcePath?: string }) =>
			(item.path ?? item.sourcePath ?? "").startsWith("记忆/"),
		)).toBe(true);
		expect(memoryRes.results.some((item: { path?: string; sourcePath?: string }) =>
			(item.path ?? item.sourcePath ?? "").startsWith("记忆体/"),
		)).toBe(false);

		const spaceRes = await searchWorkspace({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }, { q: "missing-index-space", type: "space" });
		expect(spaceRes.results).toHaveLength(0);

		const symlinkRes = await searchWorkspace({ defaultWorkspaceDir: TEST_ROOT, getRidgeDb }, { q: "alpha-leak-token", type: "file" });
		expect(symlinkRes.results).toHaveLength(0);
	});

	it("keeps project-scoped file and rag results under the selected project", async () => {
		const projectRes = await searchWorkspace(
			{ defaultWorkspaceDir: TEST_ROOT, getRidgeDb },
			{ q: "internal-token", type: "file,rag", project: "project-internal-alpha" },
		);

		expect(projectRes.results.length).toBeGreaterThan(0);
		expect(projectRes.results.every((item) => item.projectId === "project-internal-alpha")).toBe(true);
		expect(projectRes.results.some((item) => item.type === "file" && item.sourcePath === "项目/internal-alpha/spec.md")).toBe(true);
		expect(projectRes.results.some((item) => item.type === "rag" && item.sourcePath === "项目/internal-alpha/spec.md")).toBe(true);
	});
});
