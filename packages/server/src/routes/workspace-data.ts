import fs from "node:fs/promises";
import path from "node:path";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import type multer from "multer";
import type { createFileManager } from "../file-manager.js";
import type { HttpError } from "../types/index.js";
import { normalizeString } from "../utils/strings.js";
import { toPosixPath } from "../utils/paths.js";
import { getRidgeDb } from "../db/index.js";
import type { createBackgroundJobQueue } from "../background-jobs.js";
import { isConvertibleExtension } from "../conversion-service-client.js";
import {
	indexPendingTarget,
	isStandardRagSourcePath,
	markRagTargetPending,
	moveRagTarget,
	removeRagTarget,
} from "../rag-indexer.js";
import { getProjects } from "../storage/index.js";

export interface WorkspaceDataDeps {
	defaultWorkspaceDir: string;
	fileManager: ReturnType<typeof createFileManager>;
	openWithDefaultApp: (targetPath: string) => Promise<void>;
	upload: multer.Multer;
	getJobQueue?: () => ReturnType<typeof createBackgroundJobQueue> | undefined;
	/** Whether the Python conversion service is configured; when false, skip auto-enqueue. */
	isConversionEnabled?: () => boolean;
	fileEntryCreateSchema: {
		parse: (data: unknown) => {
			root: unknown;
			directory: unknown;
			name: unknown;
			kind: "file" | "directory";
		};
	};
	fileEntryMoveSchema: {
		parse: (data: unknown) => {
			root: unknown;
			path: unknown;
			targetDirectory?: unknown;
			name?: unknown;
		};
	};
	fileContentQuerySchema: {
		parse: (data: unknown) => { root?: string; path?: string };
	};
	fileOpenSchema: { parse: (data: unknown) => { root: string; path: string } };
}

function isSpaceIndexHtml(filePath: string, workspaceDir: string): boolean {
	const relative = toPosixPath(path.relative(workspaceDir, filePath));
	return !relative.startsWith("../") &&
		!path.isAbsolute(relative) &&
		relative.startsWith("空间/") &&
		path.basename(relative).toLowerCase() === "index.html";
}

function isImmediateTextRagSource(filePath: string, workspaceDir: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return ext === ".md" || ext === ".markdown" || isSpaceIndexHtml(filePath, workspaceDir);
}

export function createWorkspaceDataRouter(deps: WorkspaceDataDeps) {
	const router = express.Router();

	const {
		defaultWorkspaceDir,
		fileManager,
		openWithDefaultApp,
		upload,
		fileEntryCreateSchema,
		fileEntryMoveSchema,
		fileContentQuerySchema,
		fileOpenSchema,
	} = deps;

	router.get(
		"/api/workspace/journal",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const root =
					typeof req.query.root === "string"
						? req.query.root
						: defaultWorkspaceDir;
				const year = Number(req.query.year) || new Date().getFullYear();
				const month = Number(req.query.month);

				if (month) {
					const monthStr = String(month).padStart(2, "0");
					const journalDir = path.join(root, "日记", String(year), monthStr);
					let entries: string[] = [];
					try {
						const files = await fs.readdir(journalDir);
						entries = files
							.filter((f) => f.endsWith(".md"))
							.map((f) => f.replace(/\.md$/, ""));
					} catch {
						// 目录不存在
					}
					res.json({ entries });
				} else {
					const yearDir = path.join(root, "日记", String(year));
					let months: number[] = [];
					try {
						const dirs = await fs.readdir(yearDir);
						months = dirs
							.filter((d) => /^\d{2}$/.test(d))
							.map((d) => Number(d));
					} catch {
						// 目录不存在
					}
					res.json({ months });
				}
			} catch (error) {
				next(error);
			}
		},
	);

	// Bases API
	router.get(
		"/api/workspace/base",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const relPath =
					typeof req.query.path === "string" ? req.query.path : "";
				if (!relPath) {
					const error = new Error("path is required") as HttpError;
					error.statusCode = 400;
					throw error;
				}
				const fullPath = path.join(defaultWorkspaceDir, relPath);
				const content = await fs.readFile(fullPath, "utf-8");
				const baseData = JSON.parse(content);

				// 解析文件引用行：读取 frontmatter 合并到行数据
				for (const row of baseData.rows ?? []) {
					if (row.type === "file" && row.path) {
						const filePath = path.join(defaultWorkspaceDir, row.path);
						try {
							const fileContent = await fs.readFile(filePath, "utf-8");
							const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
							if (fmMatch) {
								const fm: Record<string, unknown> = {};
								for (const line of fmMatch[1].split("\n")) {
									const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
									if (kv) fm[kv[1]] = kv[2].trim();
								}
								row.cells = { ...row.cells, ...fm };
							}
							row.fileTitle = path.basename(row.path, ".md");
						} catch {
							row.fileTitle = path.basename(row.path);
						}
					}
				}

				res.json(baseData);
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/api/workspace/base",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { path: relPath, data } = req.body ?? {};
				if (!relPath) {
					const error = new Error("path is required") as HttpError;
					error.statusCode = 400;
					throw error;
				}
				const fullPath = path.join(defaultWorkspaceDir, relPath);

				// 保存时剥离运行时添加的 fileTitle
				const cleanRows = (data.rows ?? []).map(
					(row: Record<string, unknown>) => {
						const rest = { ...row };
						delete rest.fileTitle;
						return rest;
					},
				);
				const saveData = { ...data, rows: cleanRows };

				await fs.writeFile(
					fullPath,
					JSON.stringify(saveData, null, 2),
					"utf-8",
				);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/workspace/base/create",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { name, folder } = req.body ?? {};
				if (!name) {
					const error = new Error("name is required") as HttpError;
					error.statusCode = 400;
					throw error;
				}
				const baseName = name.endsWith(".base") ? name : `${name}.base`;
				const dir = folder
					? path.join(defaultWorkspaceDir, folder)
					: defaultWorkspaceDir;
				await fs.mkdir(dir, { recursive: true });
				const fullPath = path.join(dir, baseName);

				const colId = () =>
					`c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
				const rowId = () =>
					`r${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
				const viewId = () =>
					`v${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

				const defaultData = {
					name: name.replace(/\.base$/, ""),
					columns: [
						{ id: colId(), name: "名称", type: "text" },
						{
							id: colId(),
							name: "状态",
							type: "select",
							options: ["待做", "进行中", "完成"],
						},
					],
					sources: [],
					rows: [{ id: rowId(), type: "independent", cells: {} }],
					views: [
						{
							id: viewId(),
							name: "表格",
							type: "table",
							sort: null,
							filters: [],
						},
					],
					activeViewId: "",
				};
				defaultData.activeViewId = defaultData.views[0].id;

				await fs.writeFile(
					fullPath,
					JSON.stringify(defaultData, null, 2),
					"utf-8",
				);
				const relPath = path.relative(defaultWorkspaceDir, fullPath);
				res.json({ path: relPath, data: defaultData });
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/api/workspace/base",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const relPath =
					typeof req.query.path === "string" ? req.query.path : "";
				if (!relPath) {
					const error = new Error("path is required") as HttpError;
					error.statusCode = 400;
					throw error;
				}
				const fullPath = path.join(defaultWorkspaceDir, relPath);
				await fs.unlink(fullPath);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/files/entries",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = fileEntryCreateSchema.parse(req.body ?? {});
				const entry = await fileManager.createEntry(payload);
				res.status(201).json({
					entry,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.patch(
		"/api/files/entries/path",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = fileEntryMoveSchema.parse(req.body ?? {});
				// Resolve old path before move to know the original posix path
				const { targetPath: oldTargetPath } = await fileManager.resolveManagedFileLocation({
					root: payload.root,
					path: payload.path,
				});
				const entry = await fileManager.moveEntry(payload);
				const oldPosixPath = toPosixPath(oldTargetPath);
				const newPosixPath = entry.path;

				// Sync file_processing_status: file = exact update, directory = prefix batch update
				const db = await getRidgeDb();
				if (entry.kind === "file") {
					db.prepare(
						`UPDATE file_processing_status SET file_path = ?, updated_at = ? WHERE file_path = ?`,
					).run(newPosixPath, Date.now(), oldPosixPath);
					await moveRagTarget(oldPosixPath, newPosixPath, { workspaceDir: defaultWorkspaceDir });
				} else {
					const oldPrefix = oldPosixPath.replace(/\/$/, "");
					const newPrefix = newPosixPath.replace(/\/$/, "");
					const likePrefix = (oldPrefix + "/").replace(/[%_\\]/g, (c) => `\\${c}`);
					db.prepare(
						`UPDATE file_processing_status
						 SET file_path = ? || substr(file_path, length(?) + 1), updated_at = ?
						 WHERE file_path LIKE ? ESCAPE '\\'`,
					).run(newPrefix, oldPrefix, Date.now(), `${likePrefix}%`);
					await moveRagTarget(oldPrefix, newPrefix, { workspaceDir: defaultWorkspaceDir });
				}

				res.json({
					entry,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/api/files/entries",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = fileContentQuerySchema.parse(req.query ?? {});
				const payload = await fileManager.trashEntry(query.root, query.path);
				// Sync delete file_processing_status records when file/directory is deleted
				const db = await getRidgeDb();
				// Determine if trashed path was a file or directory from filesystem state after trash
				// (trash removes it, so we clean based on what we know)
				const trashedPath = payload.path;
				// Try to infer: if the path had an extension and no trailing slash, likely a file
				// But to be safe, delete exact match AND prefix match (directory case)
				db.prepare("DELETE FROM file_processing_status WHERE file_path = ?").run(trashedPath);
				// Also delete any records for files inside this directory (directory deletion case)
				// Escape LIKE special characters to prevent wildcard mis-match
				const dirPrefix = trashedPath.replace(/\/$/, "") + "/";
				const escapedPrefix = dirPrefix.replace(/[%_\\]/g, (c) => `\\${c}`);
				db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ? ESCAPE '\\'").run(`${escapedPrefix}%`);
				await removeRagTarget(trashedPath);
				res.json(payload);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/files/upload",
		upload.array("files"),
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const root = normalizeString(req.body?.root);
				const directory = normalizeString(req.body?.directory);
				const files = Array.isArray(req.files) ? req.files : [];
				const entries = await fileManager.uploadFiles({
					root,
					directory,
					files,
				});

				// Auto-create pending processing records for files in visible directories
				const db = await getRidgeDb();
				const now = Date.now();
				for (const entry of entries) {
					if (entry.kind !== "file") continue;
					// Skip ridge system paths
					const entryPathSegments = toPosixPath(entry.path).split("/").filter(Boolean);
					if (entryPathSegments.includes(".ridge")) continue;
					const isExternalProjectPath = (await getProjects()).projects.some(
						(p) => p.projectType === "external" && entry.path.startsWith(p.path),
					);
					if (isExternalProjectPath) continue;
					const ext = path.extname(entry.path).toLowerCase();
					const isImmediateTextSource = isImmediateTextRagSource(entry.path, defaultWorkspaceDir);
					if (isStandardRagSourcePath(entry.path)) {
						await markRagTargetPending(entry.path, {
							workspaceDir: defaultWorkspaceDir,
							refreshPolicy: "immediate",
							event: "upload",
						});
						await indexPendingTarget(entry.path, {
							workspaceDir: defaultWorkspaceDir,
							event: "upload",
						});
					}
					// Markdown files are directly text assets: skip conversion queue, mark as converted
					if (isImmediateTextSource) {
						db.prepare(
							`INSERT OR IGNORE INTO file_processing_status (
								file_path, workspace_path, status, converted_at, updated_at
							) VALUES (?, ?, ?, ?, ?)`,
						).run(entry.path, defaultWorkspaceDir, "converted", now, now);
						continue;
					}
					db.prepare(
						`INSERT OR IGNORE INTO file_processing_status (
							file_path, workspace_path, status, updated_at
						) VALUES (?, ?, ?, ?)`,
					).run(entry.path, defaultWorkspaceDir, "pending", now);
					// Enqueue conversion job for convertible files ONLY when Python service is configured
					if (isConvertibleExtension(ext) && deps.getJobQueue && deps.isConversionEnabled?.() === true) {
						const queue = deps.getJobQueue();
						if (queue) {
							queue.enqueue({
								type: "file.convert",
								relatedType: "file",
								relatedId: entry.path,
								payload: { sourcePath: entry.path, workspaceDir: defaultWorkspaceDir },
								maxAttempts: 3,
								notifyOnFailure: true,
							});
						}
					}
				}

				res.status(201).json({
					entries,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/files/open",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = fileOpenSchema.parse(req.body ?? {});
				const { targetPath } = await fileManager.resolveManagedFileLocation({
					root: payload.root,
					path: payload.path,
				});
				const stats = await fs.stat(targetPath);
				if (!stats.isFile()) {
					const error = new Error("Requested path is not a file") as HttpError;
					error.statusCode = 400;
					throw error;
				}
				await openWithDefaultApp(targetPath);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
