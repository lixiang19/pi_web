import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createIsoGitService, type IsoGitContext } from "./iso-git-service.js";
import type { HttpError } from "./types/index.js";
import { getDataDir, toPosixPath } from "./utils/paths.js";

export interface WorkspaceVersionPointInput {
	workspaceDir: string;
	files: string[];
	message: string;
}

export interface WorkspaceVersionPointResult {
	hash: string | null;
	files: string[];
}

function toHttpError(message: string, statusCode: number): HttpError {
	const error = new Error(message) as HttpError;
	error.statusCode = statusCode;
	return error;
}

function workspaceHash(workspaceDir: string): string {
	return crypto.createHash("sha256").update(path.resolve(workspaceDir)).digest("hex").slice(0, 24);
}

export function getWorkspaceVersionContext(workspaceDir: string): IsoGitContext {
	const workTree = path.resolve(workspaceDir);
	return {
		workTree,
		gitdir: path.join(getDataDir(), "ridge-workspace-git", workspaceHash(workTree)),
	};
}

async function toWorkspaceRelativePath(workspaceDir: string, filePath: string): Promise<string | null> {
	const root = path.resolve(workspaceDir);
	const target = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
	const relative = path.relative(root, target);
	if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
		throw toHttpError("Version point file must stay inside workspace", 400);
	}
	const segments = toPosixPath(relative).split("/");
	if (segments.includes(".ridge")) return null;

	try {
		const realTarget = await fs.realpath(target);
		const realRoot = await fs.realpath(root);
		const realRelative = path.relative(realRoot, realTarget);
		if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
			throw toHttpError("Version point file must stay inside workspace", 400);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}

	return toPosixPath(relative);
}

function isNoChangeError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("No changes") || message.includes("nothing to commit");
}

export async function commitWorkspaceVersionPoint(
	input: WorkspaceVersionPointInput,
): Promise<WorkspaceVersionPointResult> {
	const ctx = getWorkspaceVersionContext(input.workspaceDir);
	const relativeFiles = (
		await Promise.all(input.files.map((file) => toWorkspaceRelativePath(ctx.workTree, file)))
	).filter((file): file is string => Boolean(file));
	const uniqueFiles = [...new Set(relativeFiles)];
	if (uniqueFiles.length === 0) {
		return { hash: null, files: [] };
	}

	const service = createIsoGitService();
	try {
		const result = await service.commit(ctx, input.message, uniqueFiles);
		return { hash: result.hash, files: uniqueFiles };
	} catch (error) {
		if (isNoChangeError(error)) {
			return { hash: null, files: uniqueFiles };
		}
		throw error;
	}
}
