import crypto from "node:crypto";
import fs from "node:fs/promises";
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

export interface WorkspaceFilesDeps {
	defaultWorkspaceDir: string;
	fileManager: ReturnType<typeof createFileManager>;
	getRidgeDb: () => Promise<RidgeDatabase>;
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

		const statusSet = new Set<string>(FILE_PROCESSING_STATUS_VALUES);
		return entries.map((entry) => {
			if (entry.kind !== "file") return entry;
			const info = statusByPath.get(toPosixPath(entry.path));
			if (!info) return entry;
			if (!statusSet.has(info.status)) {
				return entry;
			}
			return {
				...entry,
				processingStatus: info.status as FileTreeEntry["processingStatus"],
				processingError: info.error ?? undefined,
			};
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
								event_id, event_type, severity, title, body,
								payload_json, status, created_at, read_at
							) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						).run(
							`notification-${crypto.randomUUID()}`,
							eventType,
							"error",
							title,
							errorMessage,
							JSON.stringify({ filePath: posixPath, error: errorMessage }),
							"unread",
							now,
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

				db.prepare(
					`UPDATE file_processing_status
					 SET status = ?, error = NULL, updated_at = ?
					 WHERE file_path = ?`,
				).run("pending", Date.now(), posixPath);

				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
