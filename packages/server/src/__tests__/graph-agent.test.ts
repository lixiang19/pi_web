import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import {
	GRAPH_EXTRACTION_PROMPT,
	collectGraphExtractionSources,
	createGraphMaintenanceRunner,
	parseGraphAgentResponse,
} from "../graph-agent.js";

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
	const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-graph-"));
	cleanupDirs.push(workspaceDir);
	await fs.mkdir(path.join(workspaceDir, "记忆", "daily", "2026", "05"), { recursive: true });
	await fs.mkdir(path.join(workspaceDir, "项目", "alpha"), { recursive: true });
	await fs.mkdir(path.join(workspaceDir, "附件"), { recursive: true });
	await fs.mkdir(path.join(workspaceDir, ".ridge", "rag"), { recursive: true });
	await fs.mkdir(path.join(workspaceDir, ".ridge", "graph.kuzu"), { recursive: true });
	return workspaceDir;
};

describe("graph agent source collection", () => {
	it("collects only standard Markdown artifacts, internal project docs and daily memory", async () => {
		const workspaceDir = await createWorkspace();
		const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-graph-external-"));
		cleanupDirs.push(externalDir);
		const db = createDb();
		const now = Date.now();
		const internalDoc = path.join(workspaceDir, "项目", "alpha", "README.md");
		const attachmentMd = path.join(workspaceDir, "附件", "paper.md");
		const imageSource = path.join(workspaceDir, "附件", "diagram.png");
		const originalPdf = path.join(workspaceDir, "附件", ".originals", "paper.pdf");
		const externalDoc = path.join(externalDir, "outside.md");
		await fs.mkdir(path.dirname(originalPdf), { recursive: true });
		await fs.writeFile(internalDoc, "# Alpha\n\ninternal project graph token", "utf-8");
		await fs.writeFile(attachmentMd, "# Paper\n\nstandard artifact graph token", "utf-8");
		await fs.writeFile(imageSource, "png", "utf-8");
		await fs.writeFile(originalPdf, "pdf", "utf-8");
		await fs.writeFile(externalDoc, "# Outside\n\nexternal token", "utf-8");
		await fs.writeFile(
			path.join(workspaceDir, "记忆", "daily", "2026", "05", "2026-05-15.md"),
			"# 2026-05-15\n\ndaily graph token",
			"utf-8",
		);

		db.prepare(
			`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run("project-alpha", "Alpha", path.join(workspaceDir, "项目", "alpha"), 0, now, "internal", null, workspaceDir, now);
		const insertStatus = db.prepare(
			`INSERT INTO search_index_status(target_path, target_type, status, workspace_path, source_path, refresh_policy, last_event, content_hash, indexed_at, updated_at)
			 VALUES(?, 'file', 'indexed', ?, ?, 'immediate', 'nightly', 'hash', ?, ?)`,
		);
		const insertChunk = db.prepare(
			`INSERT INTO search_chunks(chunk_id, target_path, source_path, heading_path, chunk_index, chunk_text, content_hash, file_type, embedding_id, embedding_vector, start_line, end_line, created_at, updated_at)
			 VALUES(?, ?, ?, '[]', 0, ?, 'hash', ?, '', '[]', 1, 1, ?, ?)`,
		);
		for (const [targetPath, sourcePath, text, fileType] of [
			[internalDoc, "项目/alpha/README.md", "internal project graph token", "markdown"],
			[attachmentMd, "附件/paper.md", "standard artifact graph token", "markdown"],
			[imageSource, "附件/diagram.png", "image graph token", "image"],
			[originalPdf, "附件/.originals/paper.pdf", "original graph token", "pdf"],
			[externalDoc, "outside.md", "external graph token", "markdown"],
		] as const) {
			insertStatus.run(targetPath, workspaceDir, sourcePath, now, now);
			insertChunk.run(`chunk:${sourcePath}`, targetPath, sourcePath, text, fileType, now, now);
		}

		const sources = await collectGraphExtractionSources({ db, workspaceDir });
		expect(sources.map((source) => source.sourcePath).sort()).toEqual([
			"记忆/daily/2026/05/2026-05-15.md",
			"附件/paper.md",
			"项目/alpha/README.md",
		]);
		expect(sources.map((source) => source.content).join("\n")).toContain("daily graph token");
		expect(sources.map((source) => source.content).join("\n")).not.toContain("image graph token");
		expect(sources.map((source) => source.content).join("\n")).not.toContain("original graph token");
		expect(sources.map((source) => source.content).join("\n")).not.toContain("external graph token");
			db.close();
		});

		it("skips symlinked Markdown that resolves outside the workspace", async () => {
			const workspaceDir = await createWorkspace();
			const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-graph-external-"));
			cleanupDirs.push(externalDir);
			const db = createDb();
			const now = Date.now();
			const externalDaily = path.join(externalDir, "daily-outside.md");
			const externalProjectDoc = path.join(externalDir, "project-outside.md");
			const projectDir = path.join(workspaceDir, "项目", "alpha");

			await fs.writeFile(externalDaily, "# Outside daily\n\noutside daily token", "utf-8");
			await fs.writeFile(externalProjectDoc, "# Outside project\n\noutside project token", "utf-8");
			await fs.symlink(
				externalDaily,
				path.join(workspaceDir, "记忆", "daily", "2026", "05", "linked-daily.md"),
			);
			await fs.symlink(externalProjectDoc, path.join(projectDir, "linked-project.md"));
			await fs.writeFile(path.join(projectDir, "real.md"), "# Real\n\ninside token", "utf-8");

			db.prepare(
				`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
				 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run("project-alpha", "Alpha", projectDir, 0, now, "internal", null, workspaceDir, now);

			const sources = await collectGraphExtractionSources({ db, workspaceDir });
			expect(sources.map((source) => source.sourcePath)).toContain("项目/alpha/real.md");
			expect(sources.map((source) => source.sourcePath)).not.toContain(
				"记忆/daily/2026/05/linked-daily.md",
			);
			expect(sources.map((source) => source.sourcePath)).not.toContain(
				"项目/alpha/linked-project.md",
			);
			expect(sources.map((source) => source.content).join("\n")).not.toContain("outside daily token");
			expect(sources.map((source) => source.content).join("\n")).not.toContain("outside project token");
			db.close();
		});

		it("skips internal project roots that resolve outside the workspace", async () => {
			const workspaceDir = await createWorkspace();
			const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-graph-external-"));
			cleanupDirs.push(externalDir);
			const db = createDb();
			const now = Date.now();
			const symlinkProject = path.join(workspaceDir, "项目", "linked-external");

			await fs.writeFile(path.join(externalDir, "outside.md"), "# Outside\n\nexternal project root token", "utf-8");
			await fs.symlink(externalDir, symlinkProject, "dir");
			db.prepare(
				`INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, updated_at)
				 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run("project-linked", "Linked", symlinkProject, 0, now, "internal", null, workspaceDir, now);

			const sources = await collectGraphExtractionSources({ db, workspaceDir });

			expect(sources.map((source) => source.sourcePath)).not.toContain("项目/linked-external/outside.md");
			expect(sources.map((source) => source.content).join("\n")).not.toContain(
				"external project root token",
			);
			db.close();
		});

		it("parses strict graph extraction JSON and rejects invalid entity types", () => {
		expect(GRAPH_EXTRACTION_PROMPT).toContain("entities");
		expect(GRAPH_EXTRACTION_PROMPT).toContain("relations");
		expect(GRAPH_EXTRACTION_PROMPT).toContain("evidence");
		expect(GRAPH_EXTRACTION_PROMPT).toContain("只读取当前输入");

		const parsed = parseGraphAgentResponse(`{
			"entities": [
				{ "type": "Decision", "id": "decision-1", "name": "Use Kuzu", "summary": "Graph store", "sourcePath": "Wiki/index.md", "evidence": "Use Kuzu", "confidence": 0.8 }
			],
			"relations": []
		}`);
		expect(parsed.entities[0]?.type).toBe("Decision");

		expect(() =>
			parseGraphAgentResponse(`{"entities":[{"type":"Animal","id":"x","name":"x"}],"relations":[]}`),
		).toThrow(/Unsupported graph entity type/);
	});

	it("runs extraction and writes the result to the graph store", async () => {
		const workspaceDir = await createWorkspace();
		const db = createDb();
		const markdownPath = path.join(workspaceDir, "附件", "paper.md");
		await fs.writeFile(markdownPath, "# Paper\n\nKuzu stores decisions.", "utf-8");
		const now = Date.now();
		db.prepare(
			`INSERT INTO search_index_status(target_path, target_type, status, workspace_path, source_path, refresh_policy, last_event, content_hash, indexed_at, updated_at)
			 VALUES(?, 'file', 'indexed', ?, '附件/paper.md', 'immediate', 'nightly', 'hash', ?, ?)`,
		).run(markdownPath, workspaceDir, now, now);
		db.prepare(
			`INSERT INTO search_chunks(chunk_id, target_path, source_path, heading_path, chunk_index, chunk_text, content_hash, file_type, embedding_id, embedding_vector, start_line, end_line, created_at, updated_at)
			 VALUES('chunk-paper', ?, '附件/paper.md', '[]', 0, 'Kuzu stores decisions.', 'hash', 'markdown', '', '[]', 1, 1, ?, ?)`,
		).run(markdownPath, now, now);

		const writes: unknown[] = [];
		const runner = createGraphMaintenanceRunner({
			db,
			workspaceDir,
			extract: async (sources) => {
				expect(sources).toHaveLength(1);
				expect(sources[0]?.sourcePath).toBe("附件/paper.md");
				return {
					entities: [
						{
							type: "Decision",
							id: "decision-kuzu",
							name: "Use Kuzu",
							summary: "Graph storage decision",
							sourcePath: "附件/paper.md",
							evidence: "Kuzu stores decisions.",
							confidence: 0.9,
						},
					],
					relations: [],
				};
			},
			graphStore: {
				upsertExtraction: async (extraction) => {
					writes.push(extraction);
				},
				applyCorrection: async () => undefined,
			},
		});

		const result = await runner.runNightlyOnce();
		expect(result).toEqual({ sources: 1, entities: 1, relations: 0 });
		expect(writes).toHaveLength(1);
		db.close();
	});
});
