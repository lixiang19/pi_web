import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import JSZip from "jszip";

export interface ServerBackupPlan {
	includePaths: string[];
	excludePaths: string[];
}

export interface ServerBackupArchive {
	buffer: Buffer;
	fileName: string;
	mimeType: "application/zip";
	plan: ServerBackupPlan;
}

export function buildServerBackupPlan(options: {
	workspaceDir: string;
	ridgeDbPath: string;
}): ServerBackupPlan {
	const workspaceDir = path.resolve(options.workspaceDir);
	const ridgeDir = path.join(workspaceDir, ".ridge");
	return {
		includePaths: [
			path.resolve(options.ridgeDbPath),
			workspaceDir,
			path.join(ridgeDir, "graph.kuzu"),
		],
		excludePaths: [
			path.join(ridgeDir, "rag"),
			path.join(ridgeDir, "cache"),
			path.join(ridgeDir, "runtime"),
			path.join(ridgeDir, "fleeting-attachments"),
		],
	};
}

const isSamePath = (left: string, right: string): boolean =>
	path.resolve(left) === path.resolve(right);

const isPathInsideOrEqual = (candidate: string, root: string): boolean => {
	const relative = path.relative(path.resolve(root), path.resolve(candidate));
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const toZipPath = (value: string): string =>
	value.split(path.sep).filter(Boolean).join("/");

const pathExists = async (targetPath: string): Promise<boolean> => {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
};

const isExcluded = (targetPath: string, excludePaths: string[]): boolean =>
	excludePaths.some((excludedPath) => isPathInsideOrEqual(targetPath, excludedPath));

export async function createServerBackupArchive(options: {
	workspaceDir: string;
	ridgeDbPath: string;
	now?: () => Date;
}): Promise<ServerBackupArchive> {
	const workspaceDir = path.resolve(options.workspaceDir);
	const ridgeDbPath = path.resolve(options.ridgeDbPath);
	const createdAt = (options.now ?? (() => new Date()))();
	const plan = buildServerBackupPlan({ workspaceDir, ridgeDbPath });
	const zip = new JSZip();
	const addedArchivePaths = new Set<string>();

	const addFile = async (sourcePath: string, archivePath: string) => {
		const normalizedArchivePath = toZipPath(archivePath);
		if (addedArchivePaths.has(normalizedArchivePath)) return;
		const stat = await fs.stat(sourcePath);
		if (!stat.isFile()) return;
		zip.file(normalizedArchivePath, await fs.readFile(sourcePath), {
			date: new Date(stat.mtimeMs),
		});
		addedArchivePaths.add(normalizedArchivePath);
	};

	const addDirectory = async (sourceDir: string, archiveRoot: string) => {
		const entries = await fs.readdir(sourceDir, { withFileTypes: true });
		for (const entry of entries) {
			const sourcePath = path.join(sourceDir, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (isExcluded(sourcePath, plan.excludePaths)) continue;
			const archivePath = path.join(archiveRoot, entry.name);
			if (entry.isDirectory()) {
				await addDirectory(sourcePath, archivePath);
			} else if (entry.isFile()) {
				await addFile(sourcePath, archivePath);
			}
		}
	};

	for (const includePath of plan.includePaths) {
		if (!(await pathExists(includePath))) continue;
		if (isSamePath(includePath, ridgeDbPath)) {
			await addFile(includePath, path.join("server", "ridge.db"));
			continue;
		}
		if (isSamePath(includePath, workspaceDir)) {
			await addDirectory(includePath, "workspace");
			continue;
		}
		if (isPathInsideOrEqual(includePath, workspaceDir)) {
			const relativePath = path.relative(workspaceDir, includePath);
			const stat = await fs.stat(includePath);
			if (stat.isDirectory()) {
				await addDirectory(includePath, path.join("workspace", relativePath));
			} else if (stat.isFile()) {
				await addFile(includePath, path.join("workspace", relativePath));
			}
			continue;
		}
		const stat = await fs.stat(includePath);
		if (stat.isFile()) {
			await addFile(includePath, path.join("extra", path.basename(includePath)));
		}
	}

	zip.file(
		"backup-manifest.json",
		JSON.stringify({
			createdAt: createdAt.toISOString(),
			workspaceDir,
			ridgeDbPath,
			includePaths: plan.includePaths,
			excludePaths: plan.excludePaths,
		}, null, 2),
		{ date: createdAt },
	);

	const timestamp = createdAt.toISOString().replace(/[:.]/g, "-");
	return {
		buffer: await zip.generateAsync({ type: "nodebuffer" }),
		fileName: `ridge-backup-${timestamp}.zip`,
		mimeType: "application/zip",
		plan,
	};
}

export function createWorkspaceBackupRouter(options: {
	defaultWorkspaceDir: string;
	getRidgeDbPath: () => Promise<string>;
	createBackupArchive?: typeof createServerBackupArchive;
}) {
	const createBackupArchive = options.createBackupArchive ?? createServerBackupArchive;
	const router = express.Router();

	router.get(
		"/api/workspace/backup",
		async (_req: Request, res: Response, next: NextFunction) => {
			try {
				const archive = await createBackupArchive({
					workspaceDir: options.defaultWorkspaceDir,
					ridgeDbPath: await options.getRidgeDbPath(),
				});
				res.setHeader("Content-Type", archive.mimeType);
				res.setHeader(
					"Content-Disposition",
					`attachment; filename="${archive.fileName}"`,
				);
				res.send(archive.buffer);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
