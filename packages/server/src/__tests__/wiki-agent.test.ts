import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import {
	WIKI_MAINTENANCE_PROMPT,
	collectWikiMaintenanceSources,
	createKuzuGraphSnapshotReader,
	createPiWikiMaintainer,
	createWikiMaintenanceRunner,
	parseWikiAgentResponse,
} from "../wiki-agent.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
	for (const targetPath of cleanupDirs.splice(0)) {
		await fs.rm(targetPath, { recursive: true, force: true });
	}
});

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

const createWorkspace = async () => {
	const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-wiki-"));
	cleanupDirs.push(workspaceDir);
	await fs.mkdir(path.join(workspaceDir, "Wiki"), { recursive: true });
	await fs.mkdir(path.join(workspaceDir, "记忆", "daily", "2026", "05"), { recursive: true });
	await fs.mkdir(path.join(workspaceDir, "附件"), { recursive: true });
	await fs.writeFile(path.join(workspaceDir, "Wiki", "index.md"), "# Wiki\n\n用户手动保留的入口\n", "utf-8");
	await fs.writeFile(path.join(workspaceDir, "Wiki", "stale.md"), "# Stale\n\n过时页面\n", "utf-8");
	await fs.writeFile(path.join(workspaceDir, "记忆", "MEMORY.md"), "# MEMORY\n\n- 用户偏好完整实现。\n", "utf-8");
	await fs.writeFile(
		path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-15.md"),
		"# 2026-05-15\n\n完成 Wiki 维护设计。",
		"utf-8",
	);
	return workspaceDir;
};

describe("Wiki maintenance agent", () => {
	it("collects current Wiki, memory, daily, RAG and graph sources", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const now = Date.now();
		const indexedPath = path.join(workspaceDir, "附件", "paper.md");
		await fs.writeFile(indexedPath, "# Paper\n\nRAG source token", "utf-8");
		db.prepare(
			`INSERT INTO search_index_status(target_path, target_type, status, workspace_path, source_path, refresh_policy, last_event, content_hash, indexed_at, updated_at)
			 VALUES(?, 'file', 'indexed', ?, '附件/paper.md', 'immediate', 'nightly', 'hash', ?, ?)`,
		).run(indexedPath, workspaceDir, now, now);
		db.prepare(
			`INSERT INTO search_chunks(chunk_id, target_path, source_path, heading_path, chunk_index, chunk_text, content_hash, file_type, embedding_id, embedding_vector, start_line, end_line, created_at, updated_at)
			 VALUES('chunk-paper', ?, '附件/paper.md', '[]', 0, 'RAG source token', 'hash', 'markdown', '', '[]', 1, 1, ?, ?)`,
		).run(indexedPath, now, now);

		const sources = await collectWikiMaintenanceSources({
			db,
			workspaceDir,
			graphSnapshotReader: async () => [
				{ sourcePath: ".ridge/graph.kuzu", kind: "graph", content: "Graph decision token" },
			],
		});

		expect(sources.map((source) => `${source.kind}:${source.sourcePath}`).sort()).toEqual([
			"current_wiki:Wiki/index.md",
			"current_wiki:Wiki/stale.md",
			"daily:记忆/daily/2026/05/2026-05-15.md",
			"graph:.ridge/graph.kuzu",
			"memory:记忆/MEMORY.md",
			"rag:附件/paper.md",
		]);
		expect(sources.map((source) => source.content).join("\n")).toContain("用户手动保留的入口");
		expect(sources.map((source) => source.content).join("\n")).toContain("Graph decision token");
		db.close();
	});

	it("propagates graph snapshot read failures instead of treating them as empty graph", async () => {
		const reader = createKuzuGraphSnapshotReader({
			workspaceDir: "/tmp/ridge-wiki",
			clientFactory: async () => ({
				query: async () => {
					throw new Error("graph database unavailable");
				},
				execute: async () => [],
				close: async () => undefined,
			}),
		});

		await expect(reader()).rejects.toThrow(/graph database unavailable/);
	});

	it("maintains canonical Wiki pages and marks changed pages for RAG indexing", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const marked: string[] = [];
		const removed: string[] = [];
		const runner = createWikiMaintenanceRunner({
			db,
			workspaceDir,
			maintain: async (sources) => {
				expect(sources.some((source) => source.sourcePath === "Wiki/index.md")).toBe(true);
				return {
					pages: [
						{
							path: "index.md",
							content: "# Wiki\n\n- [[任务系统]]\n",
						},
						{
							path: "任务系统.md",
							content: "# 任务系统\n\n核心任务入口。\n",
						},
					],
					deletePaths: ["stale.md"],
				};
			},
			markRagTargetPendingFn: async (targetPath, options) => {
				marked.push(`${path.relative(workspaceDir, targetPath)}:${options?.refreshPolicy}:${options?.event}`);
			},
			removeRagTargetFn: async (targetPath) => {
				removed.push(path.relative(workspaceDir, targetPath));
			},
			graphSnapshotReader: async () => [],
		});

		const result = await runner.runNightlyOnce();

		expect(result).toMatchObject({ pagesWritten: 2, pagesDeleted: 1 });
		await expect(fs.readFile(path.join(workspaceDir, "Wiki", "index.md"), "utf-8")).resolves.toContain("[[任务系统]]");
		await expect(fs.readFile(path.join(workspaceDir, "Wiki", "任务系统.md"), "utf-8")).resolves.toContain("核心任务入口");
		await expect(fs.stat(path.join(workspaceDir, "Wiki", "stale.md"))).rejects.toMatchObject({ code: "ENOENT" });
		expect(marked.sort()).toEqual([
			"Wiki/index.md:immediate:nightly",
			"Wiki/任务系统.md:immediate:nightly",
		]);
		expect(removed).toEqual(["Wiki/stale.md"]);
		db.close();
	});

	it("marks unchanged returned Wiki pages when they are not indexed yet", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const marked: string[] = [];
		const runner = createWikiMaintenanceRunner({
			db,
			workspaceDir,
			maintain: async () => ({
				pages: [
					{
						path: "index.md",
						content: "# Wiki\n\n用户手动保留的入口\n",
					},
				],
				deletePaths: [],
			}),
			markRagTargetPendingFn: async (targetPath, options) => {
				marked.push(`${path.relative(workspaceDir, targetPath)}:${options?.refreshPolicy}:${options?.event}`);
			},
			graphSnapshotReader: async () => [],
		});

		const result = await runner.runNightlyOnce();

		expect(result.pagesWritten).toBe(0);
		expect(marked).toEqual(["Wiki/index.md:immediate:nightly"]);
		db.close();
	});

	it("cleans RAG target metadata when deleting an already missing Wiki page", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		await fs.rm(path.join(workspaceDir, "Wiki", "stale.md"));
		const removed: string[] = [];
		const runner = createWikiMaintenanceRunner({
			db,
			workspaceDir,
			maintain: async () => ({ pages: [], deletePaths: ["stale.md"] }),
			removeRagTargetFn: async (targetPath) => {
				removed.push(path.relative(workspaceDir, targetPath));
			},
			graphSnapshotReader: async () => [],
		});

		const result = await runner.runNightlyOnce();

		expect(result.pagesDeleted).toBe(0);
		expect(removed).toEqual(["Wiki/stale.md"]);
		db.close();
	});

	it("refuses to write a Wiki page through an existing symlink", async () => {
		const workspaceDir = await createWorkspace();
		const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-wiki-external-"));
		cleanupDirs.push(externalDir);
		const externalFile = path.join(externalDir, "outside.md");
		await fs.writeFile(externalFile, "# Outside\n\nunchanged", "utf-8");
		await fs.symlink(externalFile, path.join(workspaceDir, "Wiki", "linked.md"));
		const db = createDb();
		const runner = createWikiMaintenanceRunner({
			db,
			workspaceDir,
			maintain: async () => ({
				pages: [{ path: "linked.md", content: "# Linked\n\nchanged" }],
				deletePaths: [],
			}),
			graphSnapshotReader: async () => [],
		});

		await expect(runner.runNightlyOnce()).rejects.toThrow(/symlink/);
		await expect(fs.readFile(externalFile, "utf-8")).resolves.toContain("unchanged");
		db.close();
	});

	it("parses strict Wiki JSON and rejects paths outside Wiki", () => {
		expect(WIKI_MAINTENANCE_PROMPT).toContain("少量 canonical Markdown 页面");
		const parsed = parseWikiAgentResponse(`{
			"pages": [{ "path": "index.md", "content": "# Wiki\\n\\n- [[任务系统]]" }],
			"deletePaths": ["old.md"]
		}`);
		expect(parsed.pages[0]?.path).toBe("index.md");
		expect(() =>
			parseWikiAgentResponse(`{"pages":[{"path":"../bad.md","content":"# Bad"}],"deletePaths":[]}`),
		).toThrow(/Invalid Wiki path/);
		expect(() =>
			parseWikiAgentResponse(`{"pages":[{"path":"/tmp/bad.md","content":"# Bad"}],"deletePaths":[]}`),
		).toThrow(/Invalid Wiki path/);
		expect(() =>
			parseWikiAgentResponse(`{"pages":[{"path":"Wiki/bad.md","content":"# Bad"}],"deletePaths":[]}`),
		).toThrow(/Invalid Wiki path/);
		expect(() =>
			parseWikiAgentResponse(`{"pages":[{"path":"C:/bad.md","content":"# Bad"}],"deletePaths":[]}`),
		).toThrow(/Invalid Wiki path/);
		expect(() =>
			parseWikiAgentResponse(`{"pages":[{"path":".hidden.md","content":"# Bad"}],"deletePaths":[]}`),
		).toThrow(/Invalid Wiki path/);
		expect(() =>
			parseWikiAgentResponse(`解释文字\n{"pages":[],"deletePaths":[]}`),
		).toThrow(/strict JSON/);
	});

	it("parses only assistant text blocks and ignores thinking blocks", async () => {
		const maintainer = createPiWikiMaintainer({
			workspaceDir: "/tmp/ridge-wiki",
			authStorage: {} as never,
			modelRegistry: {} as never,
			createAgentSessionFn: async () => ({
				session: {
					messages: [
						{
							role: "assistant",
							content: [
								{ type: "thinking", thinking: '{"pages":[{"path":"bad.md","content":"# Bad"}],"deletePaths":[]}' },
								{ type: "text", text: '{"pages":[{"path":"index.md","content":"# Wiki"}],"deletePaths":[]}' },
							],
						},
					],
					prompt: async () => undefined,
				},
				extensionsResult: null,
			}),
			sessionManagerFactory: () => ({ shutdown: async () => undefined }),
		});

		await expect(maintainer([])).resolves.toEqual({
			pages: [{ path: "index.md", content: "# Wiki" }],
			deletePaths: [],
		});
	});
});
