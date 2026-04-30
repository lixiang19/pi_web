import fs from "node:fs/promises";
import path from "node:path";
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import type { HttpError } from "../types/index.js";
import { normalizeString } from "../utils/strings.js";

export interface WorkspaceDataDeps {
	defaultWorkspaceDir: string;
	fileManager: {
		createEntry: (payload: unknown) => Promise<unknown>;
		moveEntry: (payload: unknown) => Promise<unknown>;
		trashEntry: (root: string, path: string) => Promise<unknown>;
		uploadFiles: (opts: unknown) => Promise<unknown[]>;
		resolveManagedFileLocation: (
			opts: unknown,
		) => Promise<{ rootPath: string; targetPath: string }>;
	};
	openWithDefaultApp: (targetPath: string) => Promise<void>;
	upload: unknown;
	fileEntryCreateSchema: { parse: (data: unknown) => unknown };
	fileEntryMoveSchema: { parse: (data: unknown) => unknown };
	fileContentQuerySchema: { parse: (data: unknown) => unknown };
	fileOpenSchema: { parse: (data: unknown) => unknown };
}

export function createWorkspaceDataRouter(deps: WorkspaceDataDeps) {
	const router = Router();

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
						const { fileTitle, ...rest } = row;
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
					: path.join(defaultWorkspaceDir, "数据库");
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
				const entry = await fileManager.moveEntry(payload);
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
