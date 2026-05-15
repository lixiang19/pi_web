import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import type { createFileManager } from "../file-manager.js";
import type { FileTreeEntry, HttpError } from "../types/index.js";
import { toPosixPath, validateSafePath } from "../utils/paths.js";
import type { RidgeDatabase } from "../db/index.js";
import {
	buildFilePreviewPayload,
	ensureFileForPreview,
} from "../file-preview.js";
import { FILE_PROCESSING_STATUS_VALUES } from "@pi/protocol";

import type { createBackgroundJobQueue } from "../background-jobs.js";

export interface WorkspaceFilesDeps {
	defaultWorkspaceDir: string;
	fileManager: ReturnType<typeof createFileManager>;
	getRidgeDb: () => Promise<RidgeDatabase>;
	getJobQueue?: () => ReturnType<typeof createBackgroundJobQueue> | undefined;
	isConversionEnabled?: () => boolean;
}

const VALID_STATUS_SET = new Set<string>(FILE_PROCESSING_STATUS_VALUES);

const toHttpError = (message: string, statusCode: number): HttpError => {
	const error = new Error(message) as HttpError;
	error.statusCode = statusCode;
	return error;
};

// Valid status transitions (task-18 strict machine)
// retry (convert_failed/index_failed -> pending) is ONLY allowed via POST /retry
const VALID_TRANSITIONS: Record<string, Set<string>> = {
	pending: new Set(["converting"]),
	converting: new Set(["converted", "convert_failed"]),
	converted: new Set(["indexed", "index_failed"]),
	indexed: new Set([]),               // terminal success state
	convert_failed: new Set([]),        // retry only via POST /retry
	index_failed: new Set([]),          // retry only via POST /retry
};

export function createWorkspaceFilesRouter(deps: WorkspaceFilesDeps) {
	const router = express.Router();

	const { defaultWorkspaceDir, fileManager, getRidgeDb } = deps;

	const getRequiredJobQueue = () => {
		const queue = deps.getJobQueue?.();
		if (!queue) {
			throw toHttpError("Background job queue is not available", 503);
		}
		return queue;
	};

	const augmentEntriesWithStatus = async (
		entries: FileTreeEntry[],
		workspacePath: string,
	): Promise<FileTreeEntry[]> => {
		const db = await getRidgeDb();
		const rows = db
			.prepare(
				`SELECT file_path, status, error FROM file_processing_status WHERE workspace_path = ?`,
			)
			.all(workspacePath) as Array<{ file_path: string; status: string; error: string | null }>;

		const statusByPath = new Map<string, { status: string; error: string | null }>();
		for (const row of rows) {
			statusByPath.set(toPosixPath(row.file_path), { status: row.status, error: row.error });
		}

		// Also build a reverse map: original_path -> status, so .md files created
		// by conversion can inherit the original file's processing status.
		// This makes "重新转换" reachable on the .md output.
		const mdToOriginalPath = new Map<string, string>();
		for (const row of rows) {
			const originalPath = toPosixPath(row.file_path);
			const dir = path.dirname(originalPath);
			const base = path.basename(originalPath, path.extname(originalPath));
			const mdPath = `${dir}/${base}.md`;
			mdToOriginalPath.set(mdPath, originalPath);
		}

		const statusSet = new Set<string>(FILE_PROCESSING_STATUS_VALUES);
		return entries.map((entry) => {
			if (entry.kind !== "file") return entry;

			// 1. Direct match: entry path exactly matches a tracked original
			const directInfo = statusByPath.get(toPosixPath(entry.path));
			if (directInfo && statusSet.has(directInfo.status)) {
				return {
					...entry,
					processingStatus: directInfo.status as FileTreeEntry["processingStatus"],
					processingError: directInfo.error ?? undefined,
				};
			}

				// 2. Reverse match: this .md file was produced by converting some tracked original
				const originalPath = mdToOriginalPath.get(toPosixPath(entry.path));
				if (originalPath) {
					const info = statusByPath.get(originalPath);
					if (info && statusSet.has(info.status)) {
						return {
							...entry,
							processingStatus: info.status as FileTreeEntry["processingStatus"],
							processingError: info.error ?? undefined,
							originalPath,
						};
					}
				}

			return entry;
		});
	};

	router.get(
		"/api/workspace/files/tree",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const pathQuery =
					typeof req.query.path === "string" ? req.query.path : undefined;
				const { rootPath, targetPath } =
					await fileManager.resolveManagedFileLocation({
						root: defaultWorkspaceDir,
						path: pathQuery,
						fallbackToRoot: true,
					});

				const stats = await fs.stat(targetPath);
				if (!stats.isDirectory()) {
					const error = new Error(
						"Requested path is not a directory",
					) as HttpError;
					error.statusCode = 400;
					throw error;
				}

				const entries = await fileManager.listDirectoryEntries(
					targetPath,
					rootPath,
				);
				const augmented = await augmentEntriesWithStatus(
					entries,
					rootPath,
				);

				res.json({
					root: toPosixPath(rootPath),
					directory: toPosixPath(targetPath),
					entries: augmented,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/workspace/files/read",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const pathQuery =
					typeof req.query.path === "string" ? req.query.path : undefined;
				const { rootPath, targetPath, stats } = await ensureFileForPreview({
					root: defaultWorkspaceDir,
					path: pathQuery,
				});
				const payload = await buildFilePreviewPayload(
					rootPath,
					targetPath,
					stats,
				);
				res.json(payload);
			} catch (error) {
				next(error);
			}
		},
	);

	// PATCH /api/workspace/files/status — update file processing status
	router.patch(
		"/api/workspace/files/status",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { path: filePath, status, error: errorMessage } = req.body ?? {};
				if (!filePath || typeof filePath !== "string") {
					throw toHttpError("path is required", 400);
				}
				validateSafePath(filePath);
				if (!status || typeof status !== "string") {
					throw toHttpError("status is required", 400);
				}
				if (!VALID_STATUS_SET.has(status)) {
					throw toHttpError(`Invalid status: ${status}`, 400);
				}

				// Validate file exists and is within workspace
				const { targetPath } = await fileManager.resolveManagedFileLocation({
					root: defaultWorkspaceDir,
					path: filePath,
				});
				const stats = await fs.stat(targetPath);
				if (!stats.isFile()) {
					throw toHttpError("Requested path is not a file", 400);
				}

				const db = await getRidgeDb();
				const posixPath = toPosixPath(targetPath);

				// Get current record
				const current = db
					.prepare("SELECT status, converted_at, indexed_at FROM file_processing_status WHERE file_path = ?")
					.get(posixPath) as { status: string; converted_at: number | null; indexed_at: number | null } | undefined;

				if (!current) {
					throw toHttpError("File processing record not found", 404);
				}

				// Validate transition
				const allowed = VALID_TRANSITIONS[current.status];
				if (!allowed || !allowed.has(status)) {
					throw toHttpError(
						`Invalid status transition from ${current.status} to ${status}`,
						400,
					);
				}

				// Failure states require error
				if ((status === "convert_failed" || status === "index_failed") && (!errorMessage || typeof errorMessage !== "string")) {
					throw toHttpError("error is required for failed status", 400);
				}

				const now = Date.now();
				// Preserve existing timestamps: only set converted_at when entering converted, only set indexed_at when entering indexed
				const convertedAt = status === "converted" ? now : current.converted_at;
				const indexedAt = status === "indexed" ? now : current.indexed_at;

				// Atomic transaction: update status + insert notification on failure
				const tx = db.transaction(() => {
					db.prepare(
						`UPDATE file_processing_status
						 SET status = ?, error = ?, updated_at = ?, converted_at = ?, indexed_at = ?
						 WHERE file_path = ?`,
					).run(
						status,
						errorMessage ?? null,
						now,
						convertedAt,
						indexedAt,
						posixPath,
					);

					if (status === "convert_failed" || status === "index_failed") {
						const fileName = posixPath.split("/").pop() || posixPath;
						const eventType = status === "convert_failed"
							? "file_processing.convert_failed"
							: "file_processing.index_failed";
						const title = status === "convert_failed"
							? `文件转换失败: ${fileName}`
							: `文件索引失败: ${fileName}`;

						db.prepare(
							`INSERT INTO notification_events(
								event_id, event_type, source, severity, title, body,
								related_type, related_id, actions_json, payload_json,
								status, created_at, updated_at, read_at, handled_at
							) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						).run(
							`notification-${crypto.randomUUID()}`,
							eventType,
							"file_processing",
							"error",
							title,
							errorMessage,
							"file",
							posixPath,
							JSON.stringify([{ id: "retry", label: "重试" }, { id: "open_related", label: "打开对象" }]),
							JSON.stringify({ filePath: posixPath, error: errorMessage }),
							"unread",
							now,
							now,
							null,
							null,
						);
					}
				});
				tx();

				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	// POST /api/workspace/files/retry — retry failed processing
	router.post(
		"/api/workspace/files/retry",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				// Gate: Python conversion service must be enabled
				if (!deps.isConversionEnabled || !deps.isConversionEnabled()) {
					res.status(503).json({ error: "Python conversion service not configured" });
					return;
				}

				const { path: filePath } = req.body ?? {};
				if (!filePath || typeof filePath !== "string") {
					throw toHttpError("path is required", 400);
				}
				validateSafePath(filePath);

				// Validate path resolves within workspace and is not in .ridge
				const { targetPath } = await fileManager.resolveManagedFileLocation({
					root: defaultWorkspaceDir,
					path: filePath,
				});
				const stats = await fs.stat(targetPath);
				if (!stats.isFile()) {
					throw toHttpError("Requested path is not a file", 400);
				}

				const db = await getRidgeDb();
				const posixPath = toPosixPath(targetPath);
				const row = db
					.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
					.get(posixPath) as { status: string } | undefined;

				if (!row) {
					throw toHttpError("File processing record not found", 404);
				}
				if (row.status !== "convert_failed" && row.status !== "index_failed") {
					throw toHttpError("Only failed files can be retried", 400);
				}

				const queue = getRequiredJobQueue();
				db.transaction(() => {
					db.prepare(
						`UPDATE file_processing_status
						 SET status = ?, error = NULL, updated_at = ?
						 WHERE file_path = ?`,
					).run("pending", Date.now(), posixPath);

					// Explicitly cancel any old pending/failed convert jobs for this file
					// so the new retry job is immediately runnable.
					queue.cancel({ type: "file.convert", relatedType: "file", relatedId: posixPath });
					queue.enqueue({
						type: "file.convert",
						relatedType: "file",
						relatedId: posixPath,
						payload: { workspaceDir: defaultWorkspaceDir },
						maxAttempts: 3,
						notifyOnFailure: true,
					});
				})();

				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	// POST /api/workspace/files/convert — manual re-convert via Python service
	router.post(
		"/api/workspace/files/convert",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				// Gate: Python conversion service must be enabled
				if (!deps.isConversionEnabled || !deps.isConversionEnabled()) {
					res.status(503).json({ error: "Python conversion service not configured" });
					return;
				}

				const { path: filePath, force } = req.body ?? {};
				if (!filePath || typeof filePath !== "string") {
					throw toHttpError("path is required", 400);
				}
				validateSafePath(filePath);

				// Resolve the logical path within workspace
				const { targetPath: logicalTarget } = await fileManager.resolveManagedFileLocation({
					root: defaultWorkspaceDir,
					path: filePath,
				});
				const logicalPosix = toPosixPath(logicalTarget);

				// The status record always lives at the ORIGINAL file path, even after
				// the original has been moved to .originals/.
				const db = await getRidgeDb();
				const row = db
					.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
					.get(logicalPosix) as { status: string } | undefined;

				if (!row) {
					throw toHttpError("File processing record not found", 404);
				}

				// Can only re-convert files that are in a terminal or converting state
				// pending files will naturally be picked up by the worker
				if (row.status === "pending") {
					res.json({ ok: true, note: "File is already pending conversion" });
					return;
				}

				// Check for edit guard: if already converted and force=false,
				// verify that the .md output hasn't been manually edited.
				if (row.status === "converted" && force !== true) {
					const mdPath = logicalPosix.replace(/\.[^.]+$/, ".md");
					let mdExists = false;
					try {
						await fs.stat(mdPath);
						mdExists = true;
					} catch {
						mdExists = false;
					}
					if (mdExists) {
						// Compute hash of the current .md file
						const currentMdContent = await fs.readFile(mdPath, "utf-8");
						const currentMdHash = crypto.createHash("sha256").update(currentMdContent).digest("hex");

						// Check if we have a stored hash in the metadata
						const metaPath = mdPath.replace(/\.md$/, ".metadata.json");
						let storedMdHash: string | null = null;
						try {
							const metaContent = await fs.readFile(metaPath, "utf-8");
						const meta = JSON.parse(metaContent) as Record<string, unknown>;
						const ridgeMeta = meta._ridge as Record<string, unknown> | undefined;
						storedMdHash = (ridgeMeta?.mdHash as string) ?? null;
						} catch {
							storedMdHash = null;
						}

						if (storedMdHash && currentMdHash !== storedMdHash) {
							throw toHttpError(
								"Markdown output has been edited. Use force=true to overwrite.",
								409,
							);
						}
					}
				}

				const now = Date.now();
				const queue = getRequiredJobQueue();
				db.transaction(() => {
					db.prepare(
						"UPDATE file_processing_status SET status = ?, error = NULL, updated_at = ? WHERE file_path = ?",
					).run("pending", now, logicalPosix);

					// Cancel any existing convert jobs for this file
					queue.cancel({ type: "file.convert", relatedType: "file", relatedId: logicalPosix });
					queue.enqueue({
						type: "file.convert",
						relatedType: "file",
						relatedId: logicalPosix,
						payload: { workspaceDir: defaultWorkspaceDir },
						maxAttempts: 3,
						notifyOnFailure: true,
					});
				})();

				res.json({ ok: true, enqueued: true });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
