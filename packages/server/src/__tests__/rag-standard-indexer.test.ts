import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getRidgeDb } from "../db/index.js";
import {
	indexPendingTarget,
	markRagTargetPending,
	moveRagTarget,
	refreshRagTarget,
	removeRagTarget,
	searchContent,
	type RagEmbeddingInput,
	type RagEmbeddingProvider,
} from "../rag-indexer.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "rag-standard-test");
const EXTERNAL_ROOT = path.join(os.tmpdir(), "ridge-rag-external-test");

function createTestEmbeddingProvider(): RagEmbeddingProvider {
	const textVectors = new Map<string, number[]>([
		["Launch", [1, 0, 0]],
		["diagram-token", [0, 1, 0]],
	]);
	return {
		async embed(input: RagEmbeddingInput) {
			if (input.type === "image") {
				return { id: "siliconflow:test-image-vector", vector: [0, 1, 0], model: "test" };
			}
			const exact = textVectors.get(input.text);
			if (exact) {
				return { id: `siliconflow:test-query:${input.text}`, vector: exact, model: "test" };
			}
			const vector = input.text.includes("Launch")
				? [1, 0, 0]
				: input.text.includes("diagram image")
					? [0, 1, 0]
					: [0, 0, 1];
			return {
				id: `siliconflow:test-text:${crypto.createHash("sha256").update(input.text).digest("hex")}`,
				vector,
				model: "test",
			};
		},
	};
}

const cleanDb = async () => {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM notification_events WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${EXTERNAL_ROOT}%`);
	db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${EXTERNAL_ROOT}%`);
};

describe("standard RAG indexer", () => {
	beforeEach(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.rm(EXTERNAL_ROOT, { recursive: true, force: true });
		await fs.mkdir(path.join(TEST_ROOT, "记忆"), { recursive: true });
		await fs.mkdir(EXTERNAL_ROOT, { recursive: true });
		await cleanDb();
	});

	afterAll(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		await fs.rm(EXTERNAL_ROOT, { recursive: true, force: true });
		await cleanDb();
	});

	it("indexes Markdown structure into chunks with source metadata", async () => {
		const filePath = path.join(TEST_ROOT, "记忆", "alpha.md");
		const content = [
			"# Alpha Plan",
			"",
			"Alpha overview paragraph.",
			"",
			"## Metrics",
			"",
			"| Name | Value |",
			"| --- | --- |",
			"| Launch | 2026 |",
			"",
			"## Notes",
			"",
			"Keep Beta context separate.",
		].join("\n");
		await fs.writeFile(filePath, content, "utf-8");
		await fs.writeFile(
			path.join(TEST_ROOT, "记忆", "alpha.metadata.json"),
			JSON.stringify({ file_type: "markdown", title: "Alpha Metadata", tags: ["rag"] }),
			"utf-8",
		);

		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		const embeddingProvider = createTestEmbeddingProvider();
		const result = await indexPendingTarget(filePath, { workspaceDir: TEST_ROOT, embeddingProvider });
		expect(result).toMatchObject({ success: true, indexed: true });

		const db = await getRidgeDb();
		const rows = db
			.prepare(
				`SELECT source_path, heading_path, chunk_index, chunk_text, content_hash, file_type, embedding_id, embedding_vector, start_line, end_line
				 FROM search_chunks WHERE target_path = ? ORDER BY chunk_index ASC`,
			)
			.all(filePath) as Array<Record<string, string | number>>;

		expect(rows.length).toBeGreaterThanOrEqual(3);
		expect(rows[0]).toMatchObject({
			source_path: "记忆/alpha.md",
			chunk_index: 0,
			file_type: "markdown",
		});
		expect(JSON.parse(String(rows[0].heading_path))).toEqual(["Alpha Plan"]);
		expect(String(rows[0].content_hash)).toBe(crypto.createHash("sha256").update(content).digest("hex"));
		expect(String(rows[0].embedding_id)).toMatch(/^siliconflow:test-text:/);
		const vector = JSON.parse(String(rows[0].embedding_vector)) as number[];
		expect(vector.length).toBeGreaterThan(0);
		expect(vector.some((value) => value !== 0)).toBe(true);
		expect(Number(rows[0].start_line)).toBeGreaterThan(0);
		expect(Number(rows[0].end_line)).toBeGreaterThanOrEqual(Number(rows[0].start_line));

		const tableChunk = rows.find((row) => String(row.chunk_text).includes("Launch"));
		expect(tableChunk).toBeDefined();
		expect(JSON.parse(String(tableChunk!.heading_path))).toEqual(["Alpha Plan", "Metrics"]);

		const searchResults = await searchContent("Launch", { workspaceDir: TEST_ROOT, embeddingProvider });
		expect(searchResults[0]).toMatchObject({
			targetPath: filePath,
			sourcePath: "记忆/alpha.md",
			headingPath: ["Alpha Plan", "Metrics"],
			fileType: "markdown",
		});
		expect(searchResults[0].startLine).toBeGreaterThan(0);
	});

	it("skips chunk rebuild when the content hash is unchanged", async () => {
		const filePath = path.join(TEST_ROOT, "记忆", "stable.md");
		await fs.writeFile(filePath, "# Stable\n\nstable-token", "utf-8");
		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		const first = await indexPendingTarget(filePath, { workspaceDir: TEST_ROOT });
		expect(first).toMatchObject({ success: true, indexed: true });

		const db = await getRidgeDb();
		const before = db
			.prepare("SELECT chunk_id, updated_at FROM search_chunks WHERE target_path = ? ORDER BY chunk_index LIMIT 1")
			.get(filePath) as { chunk_id: string; updated_at: number };
		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		const second = await indexPendingTarget(filePath, { workspaceDir: TEST_ROOT });
		expect(second).toMatchObject({ success: true, indexed: false, skipped: true });
		const after = db
			.prepare("SELECT chunk_id, updated_at FROM search_chunks WHERE target_path = ? ORDER BY chunk_index LIMIT 1")
			.get(filePath) as { chunk_id: string; updated_at: number };
		expect(after).toEqual(before);
	});

	it("does not create chunks for external project files", async () => {
		const externalFile = path.join(EXTERNAL_ROOT, "external.md");
		await fs.writeFile(externalFile, "# External\n\nShould not be indexed.", "utf-8");
		await markRagTargetPending(externalFile, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });

		const result = await indexPendingTarget(externalFile, { workspaceDir: TEST_ROOT });
		expect(result).toMatchObject({ success: true, indexed: false });

		const db = await getRidgeDb();
		const count = db
			.prepare("SELECT COUNT(*) AS count FROM search_chunks WHERE target_path = ?")
			.get(externalFile) as { count: number };
		expect(count.count).toBe(0);
	});

	it("does not follow workspace symlinks to external files", async () => {
		const externalFile = path.join(EXTERNAL_ROOT, "external-secret.md");
		const symlinkPath = path.join(TEST_ROOT, "记忆", "linked-secret.md");
		await fs.writeFile(externalFile, "# External\n\nexternal-secret-token", "utf-8");
		await fs.symlink(externalFile, symlinkPath).catch(() => undefined);
		await markRagTargetPending(symlinkPath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });

		const result = await refreshRagTarget(symlinkPath, { workspaceDir: TEST_ROOT });
		expect(result).toMatchObject({ success: true, indexed: false, skipped: true });
		expect(await searchContent("external-secret-token", { workspaceDir: TEST_ROOT })).toHaveLength(0);
	});

	it("indexes space index html as a standard RAG source", async () => {
		const spaceIndex = path.join(TEST_ROOT, "空间", "alpha-space", "index.html");
		await fs.mkdir(path.dirname(spaceIndex), { recursive: true });
		await fs.writeFile(spaceIndex, "<!doctype html><h1>Alpha Space</h1><p>space-rag-token</p>", "utf-8");
		await markRagTargetPending(spaceIndex, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });

		const result = await indexPendingTarget(spaceIndex, { workspaceDir: TEST_ROOT });
		expect(result).toMatchObject({ success: true, indexed: true });
		const matches = await searchContent("space-rag-token", { workspaceDir: TEST_ROOT });
		expect(matches[0]).toMatchObject({
			targetPath: spaceIndex,
			sourcePath: "空间/alpha-space/index.html",
			fileType: "html",
		});
	});

	it("indexes image files with VL embeddings and retrieves them from a text query", async () => {
		const imagePath = path.join(TEST_ROOT, "图片", "diagram.png");
		await fs.mkdir(path.dirname(imagePath), { recursive: true });
		await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		await fs.writeFile(
			path.join(TEST_ROOT, "图片", "diagram.metadata.json"),
			JSON.stringify({ title: "diagram image", caption: "architecture diagram" }),
			"utf-8",
		);
		const embeddingProvider = createTestEmbeddingProvider();

		await markRagTargetPending(imagePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		const result = await indexPendingTarget(imagePath, { workspaceDir: TEST_ROOT, embeddingProvider });

		expect(result).toMatchObject({ success: true, indexed: true });
		const db = await getRidgeDb();
		const chunk = db
			.prepare("SELECT source_path, chunk_text, file_type, embedding_id FROM search_chunks WHERE target_path = ?")
			.get(imagePath) as { source_path: string; chunk_text: string; file_type: string; embedding_id: string } | undefined;
		expect(chunk).toMatchObject({
			source_path: "图片/diagram.png",
			file_type: "image",
			embedding_id: "siliconflow:test-image-vector",
		});
		expect(chunk?.chunk_text).toContain("diagram image");

		const matches = await searchContent("diagram-token", { workspaceDir: TEST_ROOT, embeddingProvider });
		expect(matches[0]).toMatchObject({
			targetPath: imagePath,
			sourcePath: "图片/diagram.png",
			fileType: "image",
		});
	});

	it("finds exact and vector matches beyond the newest chunk window", async () => {
		const db = await getRidgeDb();
		const now = Date.now();
		const insertChunk = db.prepare(
			`INSERT INTO search_chunks (
				chunk_id, target_path, source_path, heading_path, chunk_index, chunk_text,
				content_hash, file_type, embedding_id, embedding_vector, start_line, end_line, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		);
		const oldExactPath = path.join(TEST_ROOT, "记忆", "old-exact.md");
		const oldVectorPath = path.join(TEST_ROOT, "记忆", "old-vector.md");
		const tx = db.transaction(() => {
			insertChunk.run(
				crypto.randomUUID(),
				oldExactPath,
				"记忆/old-exact.md",
				JSON.stringify(["old exact"]),
				0,
				"needle-older-than-window survives deterministic search",
				"hash-old-exact",
				"markdown",
				"siliconflow:test:3:old-exact",
				JSON.stringify([0, 0, 1]),
				1,
				1,
				now - 10_000,
				now - 10_000,
			);
			insertChunk.run(
				crypto.randomUUID(),
				oldVectorPath,
				"记忆/old-vector.md",
				JSON.stringify(["old vector"]),
				0,
				"semantic old candidate without literal query",
				"hash-old-vector",
				"markdown",
				"siliconflow:test:3:old-vector",
				JSON.stringify([0, 1, 0]),
				1,
				1,
				now - 9_999,
				now - 9_999,
			);
			for (let index = 0; index < 2_001; index++) {
				const targetPath = path.join(TEST_ROOT, "记忆", `newer-${index}.md`);
				insertChunk.run(
					crypto.randomUUID(),
					targetPath,
					`记忆/newer-${index}.md`,
					JSON.stringify(["newer"]),
					0,
					`newer filler chunk ${index}`,
					`hash-newer-${index}`,
					"markdown",
					"siliconflow:test:3:newer",
					JSON.stringify([1, 0, 0]),
					1,
					1,
					now + index,
					now + index,
				);
			}
		});
		tx();
		const exactOnlyProvider: RagEmbeddingProvider = {
			async embed() {
				throw new Error("exact-only search should not require embedding");
			},
		};
		const vectorProvider: RagEmbeddingProvider = {
			async embed(input) {
				return input.type === "text" && input.text === "semantic-window-query"
					? { id: "siliconflow:test-query:semantic", vector: [0, 1, 0], model: "test" }
					: { id: "siliconflow:test-query:other", vector: [1, 0, 0], model: "test" };
			},
		};

		const exactResults = await searchContent("needle-older-than-window", { workspaceDir: TEST_ROOT, embeddingProvider: exactOnlyProvider });
		expect(exactResults.some((item) => item.targetPath === oldExactPath)).toBe(true);

		const vectorResults = await searchContent("semantic-window-query", { workspaceDir: TEST_ROOT, embeddingProvider: vectorProvider });
		expect(vectorResults.some((item) => item.targetPath === oldVectorPath)).toBe(true);
	});

	it("keeps old chunks for deferred Markdown edits until manual refresh", async () => {
		const filePath = path.join(TEST_ROOT, "记忆", "refresh.md");
		await fs.writeFile(filePath, "# Refresh\n\nold-search-token", "utf-8");
		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		await indexPendingTarget(filePath, { workspaceDir: TEST_ROOT });

		await fs.writeFile(filePath, "# Refresh\n\nnew-search-token", "utf-8");
		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "deferred" });

		expect(await searchContent("old-search-token", { workspaceDir: TEST_ROOT })).toHaveLength(1);
		expect(await searchContent("new-search-token", { workspaceDir: TEST_ROOT })).toHaveLength(0);

		const refresh = await refreshRagTarget(filePath, { workspaceDir: TEST_ROOT });
		expect(refresh).toMatchObject({ success: true, indexed: true });

		expect(await searchContent("new-search-token", { workspaceDir: TEST_ROOT })).toHaveLength(1);
		expect(await searchContent("old-search-token", { workspaceDir: TEST_ROOT })).toHaveLength(0);
	});

	it("removes deleted chunks and rewrites metadata when files move", async () => {
		const filePath = path.join(TEST_ROOT, "记忆", "move-source.md");
		const movedPath = path.join(TEST_ROOT, "Wiki", "move-target.md");
		await fs.mkdir(path.dirname(movedPath), { recursive: true });
		await fs.writeFile(filePath, "# Move\n\nmove-token", "utf-8");
		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });
		await indexPendingTarget(filePath, { workspaceDir: TEST_ROOT });

		await fs.rename(filePath, movedPath);
		await moveRagTarget(filePath, movedPath, { workspaceDir: TEST_ROOT });

		let results = await searchContent("move-token", { workspaceDir: TEST_ROOT });
		expect(results[0]).toMatchObject({
			targetPath: movedPath,
			sourcePath: "Wiki/move-target.md",
		});

		await fs.rm(movedPath);
		await removeRagTarget(movedPath);
		results = await searchContent("move-token", { workspaceDir: TEST_ROOT });
		expect(results).toHaveLength(0);
	});

	it("records an index failure notification when the source is missing", async () => {
		const filePath = path.join(TEST_ROOT, "记忆", "missing.md");
		await markRagTargetPending(filePath, { workspaceDir: TEST_ROOT, refreshPolicy: "immediate" });

		const result = await indexPendingTarget(filePath, { workspaceDir: TEST_ROOT });
		expect(result).toMatchObject({ success: false, indexed: false });

		const db = await getRidgeDb();
		const notification = db
			.prepare("SELECT event_type, severity, title FROM notification_events WHERE payload_json LIKE ? ORDER BY created_at DESC LIMIT 1")
			.get(`%${filePath}%`) as { event_type: string; severity: string; title: string } | undefined;
		expect(notification).toMatchObject({
			event_type: "rag.index_failed",
			severity: "error",
		});
	});
});
