import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getRidgeDb } from "./db/index.js";
import { toPosixPath } from "./utils/paths.js";

/**
 * Real RAG consumer chain:
 * 1. Read search_index_status.pending entries
 * 2. Resolve current content source (Markdown file for converted docs/OCR/audio)
 * 3. Chunk text
 * 4. Store chunks in search_chunks
 * 5. Update search_index_status to indexed
 */

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
	if (!text || text.length === 0) return [];
	const chunks: string[] = [];
	let start = 0;
	while (start < text.length) {
		const end = Math.min(start + chunkSize, text.length);
		chunks.push(text.slice(start, end));
		start += chunkSize - overlap;
		if (start >= text.length) break;
	}
	return chunks;
}

/**
 * Resolve the content source for a target_path in search_index_status.
 * For .md files, reads the file directly.
 * For converted files (e.g., .pdf -> .md), reads the corresponding .md.
 */
async function resolveContentSource(targetPath: string): Promise<{ content: string; hash: string } | null> {
	try {
		const normalized = toPosixPath(targetPath);
		const ext = path.extname(normalized).toLowerCase();

		// For .md and .markdown, read the file directly
		if (ext === ".md" || ext === ".markdown") {
			const content = await fs.readFile(normalized, "utf-8");
			const hash = crypto.createHash("sha256").update(content).digest("hex");
			return { content, hash };
		}

		// For converted files (pdf, docx, etc.), the .md file sits next to the original
		// But search_index_status.target_path already points to the .md path
		// (set by file-conversion-worker.ts and workspace-data.ts)
		// So we just try to read the targetPath directly
		const content = await fs.readFile(normalized, "utf-8");
		const hash = crypto.createHash("sha256").update(content).digest("hex");
		return { content, hash };
	} catch {
		return null;
	}
}

/**
 * Index a single pending target from search_index_status.
 * Returns { success: boolean, indexed: boolean, error?: string }.
 */
export async function indexPendingTarget(targetPath: string): Promise<{ success: boolean; indexed: boolean; error?: string }> {
	const db = await getRidgeDb();

	const statusRow = db
		.prepare("SELECT status, content_hash FROM search_index_status WHERE target_path = ?")
		.get(targetPath) as { status: string; content_hash: string | null } | undefined;

	if (!statusRow) {
		return { success: false, indexed: false, error: "Target not found in search_index_status" };
	}

	if (statusRow.status !== "pending") {
		return { success: true, indexed: false }; // Already indexed or failed
	}

	const source = await resolveContentSource(targetPath);
	if (!source) {
		const now = Date.now();
		db.prepare(
			"UPDATE search_index_status SET status = ?, error = ?, updated_at = ? WHERE target_path = ?",
		).run("index_failed", "Content source not found", now, targetPath);
		return { success: false, indexed: false, error: "Content source not found" };
	}

	// If content_hash is set, verify it matches current content (detect staleness)
	if (statusRow.content_hash && statusRow.content_hash !== source.hash) {
		// Hash mismatch means content changed after status was written; re-index
		// Continue to re-index below
	}

	const chunks = chunkText(source.content);
	const now = Date.now();

	// Atomic transaction: delete old chunks, insert new chunks, update status
	const tx = db.transaction(() => {
		// Delete existing chunks for this target
		db.prepare("DELETE FROM search_chunks WHERE target_path = ?").run(targetPath);

		// Insert new chunks
		for (let i = 0; i < chunks.length; i++) {
			const chunkId = crypto.randomUUID();
			db.prepare(
				"INSERT INTO search_chunks (chunk_id, target_path, chunk_index, chunk_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			).run(chunkId, targetPath, i, chunks[i], now, now);
		}

		// Update search_index_status
		db.prepare(
			"UPDATE search_index_status SET status = ?, content_hash = ?, indexed_at = ?, error = NULL, updated_at = ? WHERE target_path = ?",
		).run("indexed", source.hash, now, now, targetPath);
	});

	tx();

	return { success: true, indexed: true };
}

/**
 * Scan all pending entries and index them.
 * Used by background worker and manual trigger.
 */
export async function indexAllPending(): Promise<{ processed: number; succeeded: number; failed: number }> {
	const db = await getRidgeDb();
	const pending = db
		.prepare("SELECT target_path FROM search_index_status WHERE status = ? ORDER BY updated_at")
		.all("pending") as Array<{ target_path: string }>;

	let succeeded = 0;
	let failed = 0;

	for (const row of pending) {
		const result = await indexPendingTarget(row.target_path);
		if (result.success && result.indexed) {
			succeeded++;
		} else if (!result.success) {
			failed++;
		}
	}

	return { processed: pending.length, succeeded, failed };
}

/**
 * Search indexed content by keyword.
 * Returns matched targets ordered by relevance (number of matching chunks).
 */
export async function searchContent(query: string, limit = 20): Promise<Array<{ targetPath: string; matchCount: number; preview: string }>> {
	const db = await getRidgeDb();
	const q = query.toLowerCase();

	const rows = db.prepare(
		`SELECT target_path, chunk_text
		 FROM search_chunks
		 WHERE lower(chunk_text) LIKE ?
		 ORDER BY chunk_index`,
	).all(`%${q}%`) as Array<{ target_path: string; chunk_text: string }>;

	const grouped = new Map<string, { matchCount: number; previews: string[] }>();
	for (const row of rows) {
		const existing = grouped.get(row.target_path);
		if (existing) {
			existing.matchCount++;
			if (existing.previews.length < 3) {
				existing.previews.push(row.chunk_text);
			}
		} else {
			grouped.set(row.target_path, {
				matchCount: 1,
				previews: [row.chunk_text],
			});
		}
	}

	const results = Array.from(grouped.entries())
		.map(([targetPath, data]) => ({
			targetPath,
			matchCount: data.matchCount,
			preview: data.previews.join(" … ").slice(0, 300),
		}))
		.sort((a, b) => b.matchCount - a.matchCount)
		.slice(0, limit);

	return results;
}
