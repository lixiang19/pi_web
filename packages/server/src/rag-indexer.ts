import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getRidgeDb, getStoredWorkspaceDir } from "./db/index.js";
import {
	MissingEmbeddingConfigError,
	createSiliconFlowEmbeddingProvider,
	type RagEmbeddingInput,
	type RagEmbeddingProvider,
} from "./siliconflow-embedding-client.js";
import { toPosixPath } from "./utils/paths.js";
import { resolveDefaultWorkspaceDir } from "./workspace-chat.js";

export type { RagEmbeddingInput, RagEmbeddingProvider } from "./siliconflow-embedding-client.js";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBEDDING_SIMILARITY_THRESHOLD = 0.74;

export type RagRefreshPolicy = "immediate" | "deferred";
export type RagIndexEvent = "upload" | "convert" | "edit" | "manual" | "nightly";

export interface RagIndexOptions {
	workspaceDir?: string;
	refreshPolicy?: RagRefreshPolicy;
	event?: RagIndexEvent;
	embeddingProvider?: RagEmbeddingProvider;
}

export interface RagIndexResult {
	success: boolean;
	indexed: boolean;
	error?: string;
	skipped?: boolean;
}

export interface RagSearchResult {
	targetPath: string;
	sourcePath: string;
	headingPath: string[];
	chunkIndex: number;
	matchCount: number;
	preview: string;
	fileType: string;
	updatedAt: number;
	startLine: number;
	endLine: number;
}

type StatusRow = {
	status: string;
	content_hash: string | null;
	refresh_policy?: string;
};

type ChunkCandidate = {
	text: string;
	headingPath: string[];
	startLine: number;
	endLine: number;
	embeddingInput?: RagEmbeddingInput;
};

type StandardSource = {
	content: string;
	embeddingInput?: RagEmbeddingInput;
	hash: string;
	sourcePath: string;
	fileType: string;
	metadataText: string;
};

type SearchChunkRow = {
	target_path: string;
	source_path: string;
	heading_path: string;
	chunk_index: number;
	chunk_text: string;
	file_type: string;
	embedding_id: string;
	embedding_vector: string;
	updated_at: number;
	start_line: number;
	end_line: number;
};

const normalizePath = (value: string): string => toPosixPath(path.resolve(value));

const markdownExtensions = new Set([".md", ".markdown"]);
const htmlExtensions = new Set([".html", ".htm"]);
const imageMimeTypesByExtension = new Map<string, string>([
	[".bmp", "image/bmp"],
	[".gif", "image/gif"],
	[".jpeg", "image/jpeg"],
	[".jpg", "image/jpeg"],
	[".png", "image/png"],
	[".tif", "image/tiff"],
	[".tiff", "image/tiff"],
	[".webp", "image/webp"],
]);
const standardSourceExtensions = new Set([
	...markdownExtensions,
	...htmlExtensions,
	...imageMimeTypesByExtension.keys(),
]);

function escapeLike(value: string): string {
	return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function workspaceTargetLike(workspaceDir: string): string {
	return `${escapeLike(workspaceDir.replace(/\/+$/, ""))}/%`;
}

async function resolveWorkspaceDir(options: RagIndexOptions = {}): Promise<string> {
	if (options.workspaceDir) {
		return normalizePath(options.workspaceDir);
	}
	const stored = await getStoredWorkspaceDir();
	return normalizePath(resolveDefaultWorkspaceDir({ homeDir: os.homedir(), storedWorkspaceDir: stored }));
}

function relativeWorkspacePath(targetPath: string, workspaceDir: string): string {
	return toPosixPath(path.relative(workspaceDir, targetPath));
}

function isInsideWorkspace(targetPath: string, workspaceDir: string): boolean {
	const rel = path.relative(workspaceDir, targetPath);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isIndexableWorkspacePath(targetPath: string, workspaceDir: string): boolean {
	if (!isInsideWorkspace(targetPath, workspaceDir)) return false;
	const rel = relativeWorkspacePath(targetPath, workspaceDir);
	const segments = rel.split("/").filter(Boolean);
	if (segments.includes(".ridge")) return false;
	if (segments.includes(".originals")) return false;
	if (segments.includes("node_modules") || segments.includes(".git")) return false;
	return true;
}

async function isIndexableResolvedPath(targetPath: string, workspaceDir: string): Promise<boolean> {
	if (!isIndexableWorkspacePath(targetPath, workspaceDir)) return false;
	const realWorkspaceDir = await fs.realpath(workspaceDir).then(normalizePath).catch(() => workspaceDir);
	const realTargetPath = await fs.realpath(targetPath).then(normalizePath).catch(() => null);
	if (!realTargetPath) return true;
	return isIndexableWorkspacePath(realTargetPath, realWorkspaceDir);
}

async function readMetadataText(targetPath: string): Promise<{ text: string; fileType: string }> {
	const parsed = path.parse(targetPath);
	const metadataPath = path.join(parsed.dir, `${parsed.name}.metadata.json`);
	try {
		const raw = await fs.readFile(metadataPath, "utf-8");
		const parsedJson = JSON.parse(raw) as unknown;
		const fileType =
			typeof parsedJson === "object" &&
			parsedJson !== null &&
			"file_type" in parsedJson &&
			typeof (parsedJson as { file_type?: unknown }).file_type === "string"
				? (parsedJson as { file_type: string }).file_type
				: "markdown";
		return {
			text: flattenMetadata(parsedJson),
			fileType,
		};
	} catch {
		return { text: "", fileType: "markdown" };
	}
}

function flattenMetadata(value: unknown, prefix = "metadata"): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return `${prefix}: ${String(value)}`;
	}
	if (Array.isArray(value)) {
		return value
			.map((item, index) => flattenMetadata(item, `${prefix}[${index}]`))
			.filter(Boolean)
			.join("\n");
	}
	if (typeof value === "object") {
		return Object.entries(value as Record<string, unknown>)
			.map(([key, item]) => flattenMetadata(item, `${prefix}.${key}`))
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

async function resolveContentSource(
	targetPath: string,
	workspaceDir: string,
): Promise<StandardSource | null> {
	const normalized = normalizePath(targetPath);
	if (!await isIndexableResolvedPath(normalized, workspaceDir)) {
		return null;
	}
	const ext = path.extname(normalized).toLowerCase();
	if (!standardSourceExtensions.has(ext)) {
		return null;
	}
	try {
		const imageMimeType = imageMimeTypesByExtension.get(ext);
		if (imageMimeType) {
			const buffer = await fs.readFile(normalized);
			const metadata = await readMetadataText(normalized);
			const sourcePath = relativeWorkspacePath(normalized, workspaceDir);
			const metadataText = metadata.text.trim();
			return {
				content: [
					`Image: ${path.basename(normalized)}`,
					`Path: ${sourcePath}`,
					metadataText,
				].filter(Boolean).join("\n"),
				embeddingInput: {
					type: "image",
					buffer,
					mimeType: imageMimeType,
					sourceName: path.basename(normalized),
				},
				hash: crypto.createHash("sha256").update(buffer).digest("hex"),
				sourcePath,
				fileType: "image",
				metadataText,
			};
		}
		const rawContent = await fs.readFile(normalized, "utf-8");
		const content = htmlExtensions.has(ext) ? htmlToSearchText(rawContent) : rawContent;
		const hash = crypto.createHash("sha256").update(rawContent).digest("hex");
		const metadata = await readMetadataText(normalized);
		return {
			content,
			hash,
			sourcePath: relativeWorkspacePath(normalized, workspaceDir),
			fileType: htmlExtensions.has(ext) ? "html" : metadata.fileType,
			metadataText: metadata.text,
		};
	} catch {
		return null;
	}
}

export function isStandardRagSourcePath(targetPath: string): boolean {
	return standardSourceExtensions.has(path.extname(targetPath).toLowerCase());
}

function htmlToSearchText(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, "\"")
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

function isHeading(line: string): { level: number; title: string } | null {
	const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
	if (!match) return null;
	return { level: match[1]!.length, title: match[2]!.trim() };
}

function splitLongBlock(candidate: ChunkCandidate): ChunkCandidate[] {
	if (candidate.text.length <= CHUNK_SIZE) return [candidate];
	const chunks: ChunkCandidate[] = [];
	let start = 0;
	while (start < candidate.text.length) {
		const end = Math.min(candidate.text.length, start + CHUNK_SIZE);
		chunks.push({
			...candidate,
			text: candidate.text.slice(start, end),
		});
		if (end >= candidate.text.length) break;
		start = Math.max(end - CHUNK_OVERLAP, start + 1);
	}
	return chunks;
}

function parseMarkdownChunks(content: string, metadataText: string): ChunkCandidate[] {
	const lines = content.split(/\r?\n/);
	const headingStack: Array<{ level: number; title: string }> = [];
	const chunks: ChunkCandidate[] = [];
	let block: string[] = [];
	let blockStartLine = 1;
	let inFence = false;

	const currentHeadingPath = () => headingStack.map((item) => item.title);
	const flushBlock = (endLine: number) => {
		const text = block.join("\n").trim();
		if (text) {
			chunks.push(...splitLongBlock({
				text,
				headingPath: currentHeadingPath(),
				startLine: blockStartLine,
				endLine,
			}));
		}
		block = [];
	};

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const lineNumber = index + 1;
		if (line.trim().startsWith("```")) {
			if (block.length === 0) blockStartLine = lineNumber;
			block.push(line);
			inFence = !inFence;
			continue;
		}
		if (!inFence) {
			const heading = isHeading(line);
			if (heading) {
				flushBlock(lineNumber - 1);
				while (headingStack.length && headingStack[headingStack.length - 1]!.level >= heading.level) {
					headingStack.pop();
				}
				headingStack.push(heading);
				blockStartLine = lineNumber;
				block = [line];
				flushBlock(lineNumber);
				continue;
			}
			if (line.trim() === "") {
				flushBlock(lineNumber - 1);
				continue;
			}
		}
		if (block.length === 0) blockStartLine = lineNumber;
		block.push(line);
	}
	flushBlock(lines.length);

	if (metadataText.trim()) {
		chunks.push({
			text: metadataText.trim(),
			headingPath: ["metadata"],
			startLine: 1,
			endLine: 1,
		});
	}

	return chunks;
}

function parseStandardChunks(source: StandardSource): ChunkCandidate[] {
	if (source.embeddingInput?.type === "image") {
		return [{
			text: source.content,
			headingPath: [path.basename(source.sourcePath)],
			startLine: 1,
			endLine: 1,
			embeddingInput: source.embeddingInput,
		}];
	}
	return parseMarkdownChunks(source.content, source.metadataText);
}

const TEST_EMBEDDING_DIMENSIONS = 96;

function tokenizeForEmbedding(text: string): string[] {
	return text
		.toLowerCase()
		.match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function tokenBucket(token: string): number {
	const digest = crypto.createHash("sha256").update(token).digest();
	return digest.readUInt32BE(0) % TEST_EMBEDDING_DIMENSIONS;
}

function createLocalTestEmbedding(text: string): { id: string; vector: number[]; model: string } {
	const vector = Array.from({ length: TEST_EMBEDDING_DIMENSIONS }, () => 0);
	for (const token of tokenizeForEmbedding(text)) {
		vector[tokenBucket(token)] += 1;
	}
	const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
	const normalized = magnitude > 0
		? vector.map((value) => Number((value / magnitude).toFixed(6)))
		: vector;
	return {
		id: `local-test-embedding:${crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`,
		vector: normalized,
		model: "local-test",
	};
}

const localTestEmbeddingProvider: RagEmbeddingProvider = {
	async embed(input) {
		if (input.type === "text") {
			return createLocalTestEmbedding(input.text);
		}
		return createLocalTestEmbedding(`${input.sourceName ?? "image"}:${crypto.createHash("sha256").update(input.buffer).digest("hex")}`);
	},
};

async function resolveEmbeddingProvider(options: RagIndexOptions): Promise<RagEmbeddingProvider> {
	if (options.embeddingProvider) return options.embeddingProvider;
	if (process.env.VITEST === "true") return localTestEmbeddingProvider;
	return createSiliconFlowEmbeddingProvider();
}

function parseEmbeddingVector(value: string): number[] {
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed)
			? parsed.map((item) => typeof item === "number" && Number.isFinite(item) ? item : 0)
			: [];
	} catch {
		return [];
	}
}

function cosineSimilarity(left: number[], right: number[]): number {
	const length = Math.min(left.length, right.length);
	if (length === 0) return 0;
	let dot = 0;
	let leftMagnitude = 0;
	let rightMagnitude = 0;
	for (let index = 0; index < length; index++) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		dot += leftValue * rightValue;
		leftMagnitude += leftValue * leftValue;
		rightMagnitude += rightValue * rightValue;
	}
	if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
	return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function countOccurrences(text: string, query: string): number {
	if (!query) return 0;
	let count = 0;
	let offset = 0;
	while (offset < text.length) {
		const index = text.indexOf(query, offset);
		if (index < 0) break;
		count++;
		offset = index + query.length;
	}
	return count;
}

async function insertFailureNotification(targetPath: string, error: string): Promise<void> {
	const db = await getRidgeDb();
	const now = Date.now();
	const fileName = path.basename(targetPath);
	db.prepare(
		`INSERT INTO notification_events(
			event_id, event_type, source, severity, title, body,
			related_type, related_id, actions_json, payload_json,
			status, created_at, updated_at, read_at, handled_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		`notification-${crypto.randomUUID()}`,
		"rag.index_failed",
		"rag",
		"error",
		`RAG 索引失败: ${fileName}`,
		error,
		"file",
		targetPath,
		JSON.stringify([{ id: "retry", label: "重试" }, { id: "open_related", label: "打开对象" }]),
		JSON.stringify({ filePath: targetPath, error }),
		"unread",
		now,
		now,
		null,
		null,
	);
}

async function markIndexFailed(targetPath: string, error: string): Promise<RagIndexResult> {
	const db = await getRidgeDb();
	const now = Date.now();
	db.prepare(
		"UPDATE search_index_status SET status = ?, error = ?, updated_at = ? WHERE target_path = ?",
	).run("index_failed", error, now, targetPath);
	await insertFailureNotification(targetPath, error);
	return { success: false, indexed: false, error };
}

export async function markRagTargetPending(
	targetPath: string,
	options: RagIndexOptions = {},
): Promise<void> {
	const db = await getRidgeDb();
	const workspaceDir = await resolveWorkspaceDir(options);
	const normalized = normalizePath(targetPath);
	if (!await isIndexableResolvedPath(normalized, workspaceDir)) {
		await removeRagTarget(normalized);
		return;
	}
	const content = await fs.readFile(normalized).catch(() => null);
	const contentHash = content ? crypto.createHash("sha256").update(content).digest("hex") : "";
	const now = Date.now();
	const sourcePath = isInsideWorkspace(normalized, workspaceDir) ? relativeWorkspacePath(normalized, workspaceDir) : "";
	db.prepare(
		`INSERT INTO search_index_status (
			target_path, target_type, status, workspace_path, source_path, refresh_policy, last_event,
			content_hash, updated_at
		) VALUES (?, 'file', 'pending', ?, ?, ?, ?, ?, ?)
		ON CONFLICT(target_path) DO UPDATE SET
			status = excluded.status,
			workspace_path = excluded.workspace_path,
			source_path = excluded.source_path,
			refresh_policy = excluded.refresh_policy,
			last_event = excluded.last_event,
			content_hash = excluded.content_hash,
			error = NULL,
			updated_at = excluded.updated_at`,
	).run(
		normalized,
		workspaceDir,
		sourcePath,
		options.refreshPolicy ?? "immediate",
		options.event ?? "manual",
		contentHash,
		now,
	);
}

export async function removeRagTarget(targetPath: string): Promise<void> {
	const db = await getRidgeDb();
	const normalized = normalizePath(targetPath);
	const prefix = normalized.replace(/\/$/, "") + "/";
	const escapedPrefix = prefix.replace(/[%_\\]/g, (char) => `\\${char}`);
	db.transaction(() => {
		db.prepare("DELETE FROM search_chunks WHERE target_path = ?").run(normalized);
		db.prepare("DELETE FROM search_index_status WHERE target_path = ?").run(normalized);
		db.prepare("DELETE FROM search_chunks WHERE target_path LIKE ? ESCAPE '\\'").run(`${escapedPrefix}%`);
		db.prepare("DELETE FROM search_index_status WHERE target_path LIKE ? ESCAPE '\\'").run(`${escapedPrefix}%`);
	})();
}

export async function moveRagTarget(
	oldPath: string,
	newPath: string,
	options: RagIndexOptions = {},
): Promise<void> {
	const db = await getRidgeDb();
	const workspaceDir = await resolveWorkspaceDir(options);
	const oldNormalized = normalizePath(oldPath);
	const newNormalized = normalizePath(newPath);
	const now = Date.now();
	const newSourcePath = relativeWorkspacePath(newNormalized, workspaceDir);
	const oldPrefix = oldNormalized.replace(/\/$/, "");
	const newPrefix = newNormalized.replace(/\/$/, "");
	const escapedPrefix = `${oldPrefix}/`.replace(/[%_\\]/g, (char) => `\\${char}`);
	db.transaction(() => {
		db.prepare(
			`UPDATE search_index_status
			 SET target_path = ?, source_path = ?, workspace_path = ?, updated_at = ?
			 WHERE target_path = ?`,
		).run(newNormalized, newSourcePath, workspaceDir, now, oldNormalized);
		db.prepare(
			`UPDATE search_chunks
			 SET target_path = ?, source_path = ?, updated_at = ?
			 WHERE target_path = ?`,
		).run(newNormalized, newSourcePath, now, oldNormalized);
		db.prepare(
			`UPDATE search_index_status
			 SET target_path = ? || substr(target_path, length(?) + 1),
			     source_path = ? || substr(source_path, length(?) + 1),
			     workspace_path = ?,
			     updated_at = ?
			 WHERE target_path LIKE ? ESCAPE '\\'`,
		).run(newPrefix, oldPrefix, relativeWorkspacePath(newPrefix, workspaceDir), relativeWorkspacePath(oldPrefix, workspaceDir), workspaceDir, now, `${escapedPrefix}%`);
		db.prepare(
			`UPDATE search_chunks
			 SET target_path = ? || substr(target_path, length(?) + 1),
			     source_path = ? || substr(source_path, length(?) + 1),
			     updated_at = ?
			 WHERE target_path LIKE ? ESCAPE '\\'`,
		).run(newPrefix, oldPrefix, relativeWorkspacePath(newPrefix, workspaceDir), relativeWorkspacePath(oldPrefix, workspaceDir), now, `${escapedPrefix}%`);
	})();
}

export async function indexPendingTarget(
	targetPath: string,
	options: RagIndexOptions = {},
): Promise<RagIndexResult> {
	const db = await getRidgeDb();
	const workspaceDir = await resolveWorkspaceDir(options);
	const normalized = normalizePath(targetPath);

	if (!await isIndexableResolvedPath(normalized, workspaceDir)) {
		await removeRagTarget(normalized);
		return { success: true, indexed: false, skipped: true };
	}
	const event = options.event ?? "manual";

	const statusRow = db
		.prepare("SELECT status, content_hash, refresh_policy FROM search_index_status WHERE target_path = ?")
		.get(normalized) as StatusRow | undefined;

	if (!statusRow) {
		return { success: false, indexed: false, error: "Target not found in search_index_status" };
	}
	if (statusRow.status !== "pending") {
		return { success: true, indexed: false };
	}
	if ((statusRow.refresh_policy ?? "immediate") === "deferred" && event !== "manual" && event !== "nightly") {
		return { success: true, indexed: false, skipped: true };
	}

	const source = await resolveContentSource(normalized, workspaceDir);
	if (!source) {
		return markIndexFailed(normalized, "Content source not found");
	}

	const existingSameHash = db
		.prepare("SELECT COUNT(*) AS count FROM search_chunks WHERE target_path = ? AND content_hash = ?")
		.get(normalized, source.hash) as { count: number } | undefined;
	if ((existingSameHash?.count ?? 0) > 0 && statusRow.content_hash === source.hash) {
		const now = Date.now();
		db.prepare(
			`UPDATE search_index_status
			 SET status = ?, workspace_path = ?, source_path = ?, refresh_policy = 'immediate',
			     last_event = ?, indexed_at = COALESCE(indexed_at, ?), error = NULL, updated_at = ?
			 WHERE target_path = ?`,
		).run("indexed", workspaceDir, source.sourcePath, event, now, now, normalized);
		return { success: true, indexed: false, skipped: true };
	}

	const chunks = parseStandardChunks(source);
	let embeddings: Array<{ id: string; vector: number[] }>;
	try {
		const embeddingProvider = await resolveEmbeddingProvider(options);
		embeddings = await Promise.all(chunks.map((chunk) =>
			embeddingProvider.embed(chunk.embeddingInput ?? { type: "text", text: chunk.text }),
		));
	} catch (error) {
		const message = error instanceof MissingEmbeddingConfigError
			? error.message
			: `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`;
		return markIndexFailed(normalized, message);
	}
	const now = Date.now();
	const tx = db.transaction(() => {
		db.prepare("DELETE FROM search_chunks WHERE target_path = ?").run(normalized);
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i]!;
			const embedding = embeddings[i]!;
			db.prepare(
				`INSERT INTO search_chunks (
					chunk_id, target_path, source_path, heading_path, chunk_index, chunk_text,
					content_hash, file_type, embedding_id, embedding_vector, start_line, end_line, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				crypto.randomUUID(),
				normalized,
				source.sourcePath,
				JSON.stringify(chunk.headingPath),
				i,
				chunk.text,
				source.hash,
				source.fileType,
				embedding.id,
				JSON.stringify(embedding.vector),
				chunk.startLine,
				chunk.endLine,
				now,
				now,
			);
		}
		db.prepare(
			`UPDATE search_index_status
			 SET status = ?, workspace_path = ?, source_path = ?, refresh_policy = 'immediate',
			     last_event = ?, content_hash = ?, indexed_at = ?, error = NULL, updated_at = ?
			 WHERE target_path = ?`,
		).run("indexed", workspaceDir, source.sourcePath, event, source.hash, now, now, normalized);
	});
	tx();

	return { success: true, indexed: true };
}

export async function refreshRagTarget(
	targetPath: string,
	options: RagIndexOptions = {},
): Promise<RagIndexResult> {
	await markRagTargetPending(targetPath, {
		...options,
		refreshPolicy: "immediate",
		event: options.event ?? "manual",
	});
	return indexPendingTarget(targetPath, {
		...options,
		event: options.event ?? "manual",
	});
}

export async function indexAllPending(
	options: RagIndexOptions & { includeDeferred?: boolean } = {},
): Promise<{ processed: number; succeeded: number; failed: number }> {
	const db = await getRidgeDb();
	const workspaceDir = await resolveWorkspaceDir(options);
	const pending = db
		.prepare(
			`SELECT target_path FROM search_index_status
			 WHERE status = ?
			   AND (workspace_path = ? OR (workspace_path = '' AND (target_path = ? OR target_path LIKE ? ESCAPE '\\')))
			   AND (? = 1 OR refresh_policy != 'deferred')
			 ORDER BY updated_at`,
		)
		.all("pending", workspaceDir, workspaceDir, workspaceTargetLike(workspaceDir), options.includeDeferred ? 1 : 0) as Array<{ target_path: string }>;

	let succeeded = 0;
	let failed = 0;
	for (const row of pending) {
		const result = await indexPendingTarget(row.target_path, {
			...options,
			workspaceDir,
			event: options.includeDeferred ? "nightly" : options.event,
		});
		if (result.success && result.indexed) succeeded++;
		if (!result.success) failed++;
	}
	return { processed: pending.length, succeeded, failed };
}

function parseHeadingPath(value: string): string[] {
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
	} catch {
		return [];
	}
}

function buildPreview(text: string, query: string): string {
	const lower = text.toLowerCase();
	const index = lower.indexOf(query.toLowerCase());
	if (index < 0) return text.slice(0, 300);
	const start = Math.max(0, index - 90);
	return text.slice(start, Math.min(text.length, index + query.length + 180));
}

function upsertSearchResult(
	grouped: Map<string, RagSearchResult>,
	row: SearchChunkRow,
	workspaceDir: string,
	query: string,
	score: number,
): void {
	if (score <= 0) return;
	const key = `${row.target_path}:${row.chunk_index}`;
	const existing = grouped.get(key);
	if (existing) {
		existing.matchCount += score;
		return;
	}
	grouped.set(key, {
		targetPath: row.target_path,
		sourcePath: row.source_path || relativeWorkspacePath(row.target_path, workspaceDir),
		headingPath: parseHeadingPath(row.heading_path),
		chunkIndex: row.chunk_index,
		matchCount: score,
		preview: buildPreview(row.chunk_text, query),
		fileType: row.file_type,
		updatedAt: row.updated_at,
		startLine: row.start_line,
		endLine: row.end_line,
	});
}

export async function searchContent(
	query: string,
	optionsOrLimit: (RagIndexOptions & { limit?: number }) | number = {},
): Promise<RagSearchResult[]> {
	const options = typeof optionsOrLimit === "number" ? { limit: optionsOrLimit } : optionsOrLimit;
	const limit = options.limit ?? 20;
	const workspaceDir = await resolveWorkspaceDir(options);
	const db = await getRidgeDb();
	const q = query.toLowerCase().trim();
	let queryEmbedding: number[] | null = null;
	try {
		queryEmbedding = (await (await resolveEmbeddingProvider(options)).embed({ type: "text", text: query })).vector;
	} catch {
		queryEmbedding = null;
	}

	const selectColumns = `target_path, source_path, heading_path, chunk_index, chunk_text,
	        file_type, embedding_id, embedding_vector, updated_at, start_line, end_line`;
	const exactRows = db.prepare(
		`SELECT ${selectColumns}
		 FROM search_chunks
		 WHERE (target_path = ? OR target_path LIKE ? ESCAPE '\\')
		   AND lower(chunk_text) LIKE ? ESCAPE '\\'
		 ORDER BY updated_at DESC, chunk_index ASC`,
	).all(workspaceDir, workspaceTargetLike(workspaceDir), `%${escapeLike(q)}%`) as SearchChunkRow[];

	const vectorRows = queryEmbedding
		? db.prepare(
			`SELECT ${selectColumns}
			 FROM search_chunks
			 WHERE (target_path = ? OR target_path LIKE ? ESCAPE '\\')
			   AND (embedding_id LIKE 'siliconflow:%' OR embedding_id LIKE 'local-test-embedding:%')
			 ORDER BY target_path ASC, chunk_index ASC`,
		).all(workspaceDir, workspaceTargetLike(workspaceDir)) as SearchChunkRow[]
		: [];

	const grouped = new Map<string, RagSearchResult>();
	for (const row of exactRows) {
		if (!isIndexableWorkspacePath(row.target_path, workspaceDir)) continue;
		upsertSearchResult(grouped, row, workspaceDir, query, countOccurrences(row.chunk_text.toLowerCase(), q));
	}
	for (const row of vectorRows) {
		if (!isIndexableWorkspacePath(row.target_path, workspaceDir)) continue;
		const similarity = cosineSimilarity(queryEmbedding ?? [], parseEmbeddingVector(row.embedding_vector));
		if (similarity < EMBEDDING_SIMILARITY_THRESHOLD) continue;
		upsertSearchResult(grouped, row, workspaceDir, query, similarity);
	}

	return Array.from(grouped.values())
		.sort((left, right) => right.matchCount - left.matchCount || right.updatedAt - left.updatedAt)
		.slice(0, limit);
}
