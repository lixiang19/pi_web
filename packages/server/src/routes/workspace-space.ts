import fs from "node:fs/promises";
import path from "node:path";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import type {
	SpacePreviewHtmlResponse,
	SpaceWorkItem,
	SpaceWorksResponse,
} from "@pi/protocol";
import {
	assertNotRidgeSystemPath,
	assertNotRidgeSystemPathReal,
	ensureResolvedPathWithinRoot,
	ensureWithinRoot,
	type HttpError,
} from "../file-manager.js";
import { toPosixPath } from "../utils/paths.js";

export interface WorkspaceSpaceDeps {
	defaultWorkspaceDir: string;
}

const SPACE_DIR_NAME = "空间";
const SPACE_INDEX_FILE = "index.html";
const MAX_PRIVATE_PREVIEW_HTML_BYTES = 10 * 1024 * 1024;

const toHttpError = (message: string, statusCode: number): HttpError => {
	const error = new Error(message) as HttpError;
	error.statusCode = statusCode;
	return error;
};

const encodeWorkId = (name: string): string =>
	Buffer.from(name, "utf8").toString("base64url");

const assertWorkName = (name: string): string => {
	if (!name || name === "." || name === "..") {
		throw toHttpError("Space work id is invalid", 400);
	}
	if (name === ".ridge") {
		throw toHttpError("Space work id must not target the hidden ridge system directory", 400);
	}
	if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
		throw toHttpError("Space work id must not include path separators", 400);
	}
	return name;
};

const decodeWorkId = (id: string): string => {
	let decoded = "";
	try {
		decoded = Buffer.from(id, "base64url").toString("utf8");
	} catch {
		throw toHttpError("Space work id is invalid", 400);
	}
	assertWorkName(decoded);
	if (encodeWorkId(decoded) !== id) {
		throw toHttpError("Space work id is invalid", 400);
	}
	return decoded;
};

const isBadRequestError = (error: unknown): boolean =>
	(error as HttpError).statusCode === 400;

const readStatsOrThrow404 = async (
	targetPath: string,
): Promise<Awaited<ReturnType<typeof fs.stat>>> => {
	try {
		return await fs.stat(targetPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw toHttpError("Space work index.html not found", 404);
		}
		throw error;
	}
};

export function createWorkspaceSpaceRouter(deps: WorkspaceSpaceDeps) {
	const router = express.Router();

	const getSpaceRoot = async (): Promise<string> => {
		const spaceRoot = path.join(deps.defaultWorkspaceDir, SPACE_DIR_NAME);
		ensureWithinRoot(spaceRoot, deps.defaultWorkspaceDir);
		assertNotRidgeSystemPath(spaceRoot, deps.defaultWorkspaceDir);
		await fs.mkdir(spaceRoot, { recursive: true, mode: 0o700 });
		await ensureResolvedPathWithinRoot(spaceRoot, deps.defaultWorkspaceDir);
		await assertNotRidgeSystemPathReal(spaceRoot, deps.defaultWorkspaceDir);
		return spaceRoot;
	};

	const resolveIndexPath = async (
		spaceRoot: string,
		workName: string,
	): Promise<string> => {
		const indexPath = path.join(spaceRoot, workName, SPACE_INDEX_FILE);
		ensureWithinRoot(indexPath, spaceRoot);
		assertNotRidgeSystemPath(indexPath, deps.defaultWorkspaceDir);
		await ensureResolvedPathWithinRoot(indexPath, spaceRoot);
		await assertNotRidgeSystemPathReal(indexPath, deps.defaultWorkspaceDir);
		return indexPath;
	};

	const serializeWork = async (
		spaceRoot: string,
		workName: string,
	): Promise<SpaceWorkItem | null> => {
		assertWorkName(workName);
		const workPath = path.join(spaceRoot, workName);
		const indexPath = await resolveIndexPath(spaceRoot, workName);
		let stats: Awaited<ReturnType<typeof fs.stat>>;
		try {
			stats = await fs.stat(indexPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return null;
			}
			throw error;
		}

		if (!stats.isFile()) {
			return null;
		}

		return {
			id: encodeWorkId(workName),
			name: workName,
			path: toPosixPath(workPath),
			indexPath: toPosixPath(indexPath),
			size: Number(stats.size),
			modifiedAt: Number(stats.mtimeMs),
		};
	};

	router.get(
		"/api/workspace/space",
		async (_req: Request, res: Response, next: NextFunction) => {
			try {
				const spaceRoot = await getSpaceRoot();
				const dirents = await fs.readdir(spaceRoot, { withFileTypes: true });
				const works = (
					await Promise.all(
						dirents
							.filter((entry) => entry.isDirectory())
							.map(async (entry) => {
								try {
									return await serializeWork(spaceRoot, entry.name);
								} catch (error) {
									if (isBadRequestError(error)) {
										return null;
									}
									throw error;
								}
							}),
					)
				).filter((work): work is SpaceWorkItem => work !== null);

				works.sort((left, right) => right.modifiedAt - left.modifiedAt);

				const payload: SpaceWorksResponse = {
					root: toPosixPath(spaceRoot),
					works,
				};
				res.json(payload);
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/workspace/space/:id/preview-html",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const id = req.params.id;
				if (!id) {
					throw toHttpError("Space work id is required", 400);
				}
				const workName = decodeWorkId(id);
				const spaceRoot = await getSpaceRoot();
				const indexPath = await resolveIndexPath(spaceRoot, workName);
				const stats = await readStatsOrThrow404(indexPath);
				if (!stats.isFile()) {
					throw toHttpError("Space work index.html not found", 404);
				}
				if (stats.size > MAX_PRIVATE_PREVIEW_HTML_BYTES) {
					throw toHttpError("Space work HTML is too large to preview", 413);
				}

				const html = await fs.readFile(indexPath, "utf8");
				const payload: SpacePreviewHtmlResponse = {
					id,
					name: workName,
					indexPath: toPosixPath(indexPath),
					html,
				};
				res.json(payload);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
