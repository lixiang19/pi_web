import fs from "node:fs/promises";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import type { createFileManager } from "../file-manager.js";
import type { FileTreeEntry, HttpError } from "../types/index.js";
import { toPosixPath } from "../utils/paths.js";
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
				`SELECT file_path, status FROM file_processing_status WHERE workspace_path = ?`,
			)
			.all(workspacePath) as Array<{ file_path: string; status: string }>;

		const statusByPath = new Map<string, string>();
		for (const row of rows) {
			statusByPath.set(toPosixPath(row.file_path), row.status);
		}

		const statusSet = new Set<string>(FILE_PROCESSING_STATUS_VALUES);
		return entries.map((entry) => {
			if (entry.kind !== "file") return entry;
			const status = statusByPath.get(toPosixPath(entry.path));
			if (!status) return entry;
			if (!statusSet.has(status)) {
				return entry;
			}
			return { ...entry, processingStatus: status as FileTreeEntry["processingStatus"] };
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

	return router;
}
