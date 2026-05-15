import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { indexPendingTarget, searchContent } from "../rag-indexer.js";

let api: ReturnType<typeof request.agent>;
const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "rag-test");

beforeAll(async () => {
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ?").run(`${TEST_ROOT}%`);
});

describe("RAG consumer chain — end-to-end", () => {
	it("indexes Markdown upload and makes content searchable", async () => {
		const fileName = `rag-md-${Date.now()}.md`;
		const content = "# Project Alpha\n\nThis is a comprehensive document about Project Alpha.\nIt contains detailed specifications and requirements.";
		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", TEST_ROOT)
			.attach("files", Buffer.from(content), fileName);
		expect(res.status).toBe(201);

		const uploadedPath = res.body.entries[0].path;

		// Markdown upload indexes synchronously; a direct consumer call should be idempotent.
		const indexResult = await indexPendingTarget(uploadedPath);
		expect(indexResult.success).toBe(true);

		// Search should find the content
		const searchResults = await searchContent("Project Alpha");
		expect(searchResults.length).toBeGreaterThan(0);
		expect(searchResults[0].targetPath).toBe(uploadedPath);
		expect(searchResults[0].preview).toContain("Project Alpha");

		// Verify DB state
		const db = await getRidgeDb();
		const statusRow = db
			.prepare("SELECT status, content_hash FROM search_index_status WHERE target_path = ?")
			.get(uploadedPath) as { status: string; content_hash: string } | undefined;
		expect(statusRow).toBeDefined();
		expect(statusRow!.status).toBe("indexed");
		const expectedHash = crypto.createHash("sha256").update(content).digest("hex");
		expect(statusRow!.content_hash).toBe(expectedHash);

		// Verify chunks exist
		const chunkRows = db
			.prepare("SELECT COUNT(*) as count FROM search_chunks WHERE target_path = ?")
			.get(uploadedPath) as { count: number };
		expect(chunkRows.count).toBeGreaterThan(0);
	});

	it("re-indexes after Markdown edit and search uses latest content", async () => {
		const fileName = `rag-edit-${Date.now()}.md`;
		const initialContent = "# Old Title\n\nThis is the old content before editing.";
		await fs.writeFile(path.join(TEST_ROOT, fileName), initialContent, "utf-8");

		// Seed search_index_status as pending
		const db = await getRidgeDb();
		const initialHash = crypto.createHash("sha256").update(initialContent).digest("hex");
		const filePath = path.join(TEST_ROOT, fileName).replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO search_index_status (target_path, target_type, status, content_hash, updated_at)
			 VALUES (?, 'file', 'pending', ?, ?)
			 ON CONFLICT(target_path) DO UPDATE SET
				status = excluded.status,
				content_hash = excluded.content_hash,
				updated_at = excluded.updated_at`,
		).run(filePath, initialHash, Date.now());

		// Index initial content
		await indexPendingTarget(filePath);

		// Edit the file via API
		const newContent = "# New Title\n\nThis is completely new content after editing.";
		const editRes = await api.put("/api/files/content").send({
			root: TEST_ROOT,
			path: filePath,
			content: newContent,
		});
		expect(editRes.status).toBe(200);

		// After edit, search_index_status should be pending with new hash
		const afterEditStatus = db
			.prepare("SELECT status, content_hash FROM search_index_status WHERE target_path = ?")
			.get(filePath) as { status: string; content_hash: string } | undefined;
		expect(afterEditStatus).toBeDefined();
		expect(afterEditStatus!.status).toBe("pending");
		const expectedNewHash = crypto.createHash("sha256").update(newContent).digest("hex");
		expect(afterEditStatus!.content_hash).toBe(expectedNewHash);

		// Re-index
		await indexPendingTarget(filePath);

		// Search should find the NEW content, not the old
		const searchResults = await searchContent("completely new content");
		expect(searchResults.length).toBeGreaterThan(0);
		expect(searchResults[0].targetPath).toBe(filePath);
		expect(searchResults[0].preview).toContain("completely new content");

		// Old content should NOT be found
		const oldSearchResults = await searchContent("old content before editing");
		const oldMatch = oldSearchResults.find((r) => r.targetPath === filePath);
		expect(oldMatch).toBeUndefined();
	});

	it("indexes conversion-produced Markdown and makes OCR text searchable", async () => {
		const fileName = `rag-ocr-${Date.now()}.md`;
		// Simulate a converted .md file (as if from image OCR or audio transcription)
		const ocrContent = "# Invoice 12345\n\nTotal Amount: $1,250.00\nDate: 2024-05-20";
		await fs.writeFile(path.join(TEST_ROOT, fileName), ocrContent, "utf-8");

		const db = await getRidgeDb();
		const filePath = path.join(TEST_ROOT, fileName).replace(/\\/g, "/");
		const ocrHash = crypto.createHash("sha256").update(ocrContent).digest("hex");

		// Simulate what file-conversion-worker does on success
		db.prepare(
			`INSERT INTO search_index_status (target_path, target_type, status, content_hash, updated_at)
			 VALUES (?, 'file', 'pending', ?, ?)
			 ON CONFLICT(target_path) DO UPDATE SET
				status = excluded.status,
				content_hash = excluded.content_hash,
				updated_at = excluded.updated_at`,
		).run(filePath, ocrHash, Date.now());

		// Verify hash was written correctly
		const statusRow = db
			.prepare("SELECT content_hash FROM search_index_status WHERE target_path = ?")
			.get(filePath) as { content_hash: string } | undefined;
		expect(statusRow).toBeDefined();
		expect(statusRow!.content_hash).toBe(ocrHash);

		// Index
		const indexResult = await indexPendingTarget(filePath);
		expect(indexResult.success).toBe(true);
		expect(indexResult.indexed).toBe(true);

		// Search for OCR content
		const searchResults = await searchContent("Invoice 12345");
		expect(searchResults.length).toBeGreaterThan(0);
		expect(searchResults[0].targetPath).toBe(filePath);
		expect(searchResults[0].preview).toContain("Invoice 12345");

		// Search for specific dollar amount
		const amountResults = await searchContent("$1,250.00");
		expect(amountResults.length).toBeGreaterThan(0);
		expect(amountResults[0].targetPath).toBe(filePath);
	});

	it("handles missing content source gracefully", async () => {
		const filePath = path.join(TEST_ROOT, `missing-${Date.now()}.md`).replace(/\\/g, "/");
		const db = await getRidgeDb();
		db.prepare(
			`INSERT INTO search_index_status (target_path, target_type, status, content_hash, updated_at)
			 VALUES (?, 'file', 'pending', '', ?)`,
		).run(filePath, Date.now());

		const result = await indexPendingTarget(filePath);
		expect(result.success).toBe(false);
		expect(result.error).toBe("Content source not found");

		const statusRow = db
			.prepare("SELECT status, error FROM search_index_status WHERE target_path = ?")
			.get(filePath) as { status: string; error: string } | undefined;
		expect(statusRow!.status).toBe("index_failed");
		expect(statusRow!.error).toBe("Content source not found");
	});

	it("exposes /api/search/content endpoint", async () => {
		const fileName = `rag-api-${Date.now()}.md`;
		const content = "API test document with unique keyword xyz789";
		await fs.writeFile(path.join(TEST_ROOT, fileName), content, "utf-8");

		const db = await getRidgeDb();
		const filePath = path.join(TEST_ROOT, fileName).replace(/\\/g, "/");
		const hash = crypto.createHash("sha256").update(content).digest("hex");
		db.prepare(
			`INSERT INTO search_index_status (target_path, target_type, status, content_hash, updated_at)
			 VALUES (?, 'file', 'pending', ?, ?)`,
		).run(filePath, hash, Date.now());

		await indexPendingTarget(filePath);

		const searchRes = await api.get(`/api/search/content?q=${encodeURIComponent("xyz789")}`);
		expect(searchRes.status).toBe(200);
		expect(searchRes.body.results).toBeDefined();
		expect(searchRes.body.results.length).toBeGreaterThan(0);
		expect(searchRes.body.results[0].targetPath).toBe(filePath);
	});
});
