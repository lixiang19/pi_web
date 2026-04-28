import fs from "node:fs/promises";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { HttpError } from "./types/index.js";
import { atomicWriteFile } from "./utils/fs.js";
import { toPosixPath } from "./utils/paths.js";
import type { WorkspaceChatConfig } from "./workspace-chat.js";

const markdownExtensions = new Set([".md", ".markdown"]);
const maxNoteContentBytes = 5 * 1024 * 1024;

const ensureWithinRoot = (candidatePath: string, rootPath: string): string => {
	const relative = path.relative(rootPath, candidatePath);
	if (relative === "") {
		return candidatePath;
	}

	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		const error = new Error(
			"Requested path is outside the allowed notes root",
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}

	return candidatePath;
};

const rejectAbsoluteNotePath = (relativePath: string): void => {
	if (path.isAbsolute(relativePath)) {
		const error = new Error("Note path must be relative") as HttpError;
		error.statusCode = 400;
		throw error;
	}
};

const ensureMarkdownPath = (targetPath: string, action: string): void => {
	const ext = path.extname(targetPath).toLowerCase();
	if (!markdownExtensions.has(ext)) {
		const error = new Error(
			`Only .md and .markdown files can be ${action}`,
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}
};

interface NoteFileEntry {
	name: string;
	path: string;
	relativePath: string;
	updatedAt: number;
	size: number;
}

async function walkMarkdownFiles(
	dirPath: string,
	rootPath: string,
): Promise<NoteFileEntry[]> {
	const entries: NoteFileEntry[] = [];
	const dirents = await fs.readdir(dirPath, { withFileTypes: true });

	for (const dirent of dirents) {
		const entryPath = path.join(dirPath, dirent.name);

		if (dirent.isDirectory()) {
			const subEntries = await walkMarkdownFiles(entryPath, rootPath);
			entries.push(...subEntries);
			continue;
		}

		const ext = path.extname(dirent.name).toLowerCase();
		if (!markdownExtensions.has(ext)) {
			continue;
		}

		try {
			const stats = await fs.stat(entryPath);
			entries.push({
				name: dirent.name,
				path: toPosixPath(entryPath),
				relativePath: toPosixPath(path.relative(rootPath, entryPath)),
				updatedAt: stats.mtimeMs,
				size: stats.size,
			});
		} catch {}
	}

	entries.sort((a, b) => b.updatedAt - a.updatedAt);

	return entries;
}

const noteContentQuerySchema = z.object({
	path: z.string().min(1),
});

const noteSaveSchema = z.object({
	path: z.string().min(1),
	content: z.string().max(maxNoteContentBytes),
});

const noteCreateSchema = z.object({
	name: z.string().max(200).optional(),
});

const noteRenameSchema = z.object({
	path: z.string().min(1),
	newName: z.string().min(1).max(200),
});

const noteDeleteQuerySchema = z.object({
	path: z.string().min(1),
});

const noteCreateFolderSchema = z.object({
	path: z.string().max(200).optional(),
});

export function createNotesRouter(chatConfig: WorkspaceChatConfig) {
	const notesRoot = chatConfig.chatProjectPath;

	const resolveNotePath = async (relativePath: string): Promise<string> => {
		rejectAbsoluteNotePath(relativePath);
		const notesRootRealPath = await fs.realpath(notesRoot);
		const resolved = path.resolve(notesRootRealPath, relativePath);
		ensureWithinRoot(resolved, notesRootRealPath);
		return resolved;
	};

	const resolveExistingNotePath = async (
		relativePath: string,
	): Promise<string> => {
		const targetPath = await resolveNotePath(relativePath);
		const realTargetPath = await fs.realpath(targetPath);
		const notesRootRealPath = await fs.realpath(notesRoot);
		ensureWithinRoot(realTargetPath, notesRootRealPath);
		return targetPath;
	};

	const resolveNewNotePath = async (relativePath: string): Promise<string> => {
		const targetPath = await resolveNotePath(relativePath);
		const notesRootRealPath = await fs.realpath(notesRoot);
		let parentRealPath: string;

		try {
			parentRealPath = await fs.realpath(path.dirname(targetPath));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				const httpError = new Error("父目录不存在") as HttpError;
				httpError.statusCode = 400;
				throw httpError;
			}
			throw error;
		}

		ensureWithinRoot(parentRealPath, notesRootRealPath);
		return targetPath;
	};

	return {
		listNotes: async (_req: Request, res: Response, next: NextFunction) => {
			try {
				const entries = await walkMarkdownFiles(notesRoot, notesRoot);
				res.json({ root: toPosixPath(notesRoot), entries });
			} catch (error) {
				next(error);
			}
		},

		getNoteContent: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = noteContentQuerySchema.parse(req.query ?? {});
				const targetPath = await resolveExistingNotePath(query.path);
				const stats = await fs.stat(targetPath);

				if (!stats.isFile()) {
					const error = new Error("Not a file") as HttpError;
					error.statusCode = 400;
					throw error;
				}

				if (stats.size > maxNoteContentBytes) {
					const error = new Error("Note content is too large") as HttpError;
					error.statusCode = 413;
					throw error;
				}

				ensureMarkdownPath(targetPath, "read");

				const content = await fs.readFile(targetPath, "utf-8");
				res.json({
					path: toPosixPath(targetPath),
					relativePath: toPosixPath(path.relative(notesRoot, targetPath)),
					content,
					updatedAt: stats.mtimeMs,
					size: stats.size,
				});
			} catch (error) {
				next(error);
			}
		},

		saveNoteContent: async (
			req: Request,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const payload = noteSaveSchema.parse(req.body ?? {});
				const targetPath = await resolveExistingNotePath(payload.path);
				ensureMarkdownPath(targetPath, "saved");

				await atomicWriteFile(targetPath, payload.content);
				const stats = await fs.stat(targetPath);

				res.json({
					path: toPosixPath(targetPath),
					relativePath: toPosixPath(path.relative(notesRoot, targetPath)),
					size: stats.size,
					updatedAt: stats.mtimeMs,
				});
			} catch (error) {
				next(error);
			}
		},

		createNote: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = noteCreateSchema.parse(req.body ?? {});
				let fileName = (payload.name ?? "").trim();

				if (!fileName) {
					const existing = await walkMarkdownFiles(notesRoot, notesRoot);
					const unnamedNums = existing
						.map((e) => e.name.match(/^未命名(\d+)\.md$/))
						.filter(Boolean)
						.map((m) => Number(m![1]));
					const nextNum =
						unnamedNums.length === 0 ? 1 : Math.max(...unnamedNums) + 1;
					fileName = `未命名${nextNum}.md`;
				} else {
					const ext = path.extname(fileName).toLowerCase();
					if (!markdownExtensions.has(ext)) {
						fileName = `${fileName}.md`;
					}
				}

				const targetPath = await resolveNewNotePath(fileName);
				ensureMarkdownPath(targetPath, "created");

				try {
					await fs.stat(targetPath);
					const error = new Error("文件已存在") as HttpError;
					error.statusCode = 409;
					throw error;
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						ensureMarkdownPath(targetPath, "created");
					} else {
						throw err;
					}
				}

				await atomicWriteFile(
					targetPath,
					`# ${path.basename(fileName, path.extname(fileName))}\n\n`,
				);
				const stats = await fs.stat(targetPath);

				res.status(201).json({
					name: path.basename(targetPath),
					path: toPosixPath(targetPath),
					relativePath: toPosixPath(path.relative(notesRoot, targetPath)),
					size: stats.size,
					updatedAt: stats.mtimeMs,
				});
			} catch (error) {
				next(error);
			}
		},

		renameNote: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = noteRenameSchema.parse(req.body ?? {});
				const oldPath = await resolveExistingNotePath(payload.path);
				ensureMarkdownPath(oldPath, "renamed");

				let newName = payload.newName.trim();
				const ext = path.extname(newName).toLowerCase();
				if (!markdownExtensions.has(ext)) {
					newName = `${newName}.md`;
				}

				const newPath = path.join(path.dirname(oldPath), newName);
				const notesRootRealPath = await fs.realpath(notesRoot);
				ensureWithinRoot(newPath, notesRootRealPath);

				try {
					await fs.stat(newPath);
					const error = new Error("目标文件已存在") as HttpError;
					error.statusCode = 409;
					throw error;
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
						throw err;
					}
				}

				await fs.rename(oldPath, newPath);
				const stats = await fs.stat(newPath);

				res.json({
					oldPath: toPosixPath(path.relative(notesRoot, oldPath)),
					name: path.basename(newPath),
					path: toPosixPath(newPath),
					relativePath: toPosixPath(path.relative(notesRoot, newPath)),
					size: stats.size,
					updatedAt: stats.mtimeMs,
				});
			} catch (error) {
				next(error);
			}
		},

		deleteNote: async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = noteDeleteQuerySchema.parse(req.query ?? {});
				const targetPath = await resolveExistingNotePath(query.path);
				ensureMarkdownPath(targetPath, "deleted");

				await fs.unlink(targetPath);
				res.json({ deleted: true });
			} catch (error) {
				next(error);
			}
		},

		createNoteFolder: async (
			req: Request,
			res: Response,
			next: NextFunction,
		) => {
			try {
				const payload = noteCreateFolderSchema.parse(req.body ?? {});
				let folderPath = (payload.path ?? "").trim();

				if (!folderPath) {
					folderPath = "未命名文件夹";
				}

				const targetPath = await resolveNewNotePath(folderPath);
				const notesRootRealPath = await fs.realpath(notesRoot);
				ensureWithinRoot(targetPath, notesRootRealPath);

				// 禁止路径中有扩展名（不是文件夹）
				if (path.extname(folderPath) !== "") {
					const error = new Error("文件夹路径不应包含扩展名") as HttpError;
					error.statusCode = 400;
					throw error;
				}

				await fs.mkdir(targetPath, { recursive: true });

				res.status(201).json({
					name: path.basename(targetPath),
					path: toPosixPath(targetPath),
					relativePath: toPosixPath(path.relative(notesRoot, targetPath)),
				});
			} catch (error) {
				next(error);
			}
		},
	};
}
