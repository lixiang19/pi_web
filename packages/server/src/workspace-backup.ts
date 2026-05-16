import fs from "node:fs/promises";
import crypto from "node:crypto";
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

export interface BackupManifestFile {
	path: string;
	size: number;
	sha256: string;
}

export interface BackupManifest {
	formatVersion: 1;
	appName: "ridge";
	createdAt: string;
	workspaceDir: string;
	ridgeDbPath: string;
	includePaths: string[];
	excludePaths: string[];
	rebuildableIndexes: ["rag", "search_chunks"];
	files: BackupManifestFile[];
}

export interface ServerRestoreResult {
	ok: true;
	preRestoreSnapshotPath: string;
	restoredFiles: string[];
	rebuildStatus: Record<BackupManifest["rebuildableIndexes"][number], "pending">;
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

const sha256 = (content: Buffer): string =>
	crypto.createHash("sha256").update(content).digest("hex");

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
	const files: BackupManifestFile[] = [];

	const addFile = async (sourcePath: string, archivePath: string) => {
		const normalizedArchivePath = toZipPath(archivePath);
		if (addedArchivePaths.has(normalizedArchivePath)) return;
		const stat = await fs.stat(sourcePath);
		if (!stat.isFile()) return;
		const content = await fs.readFile(sourcePath);
		zip.file(normalizedArchivePath, content, {
			date: new Date(stat.mtimeMs),
		});
		addedArchivePaths.add(normalizedArchivePath);
		files.push({
			path: normalizedArchivePath,
			size: content.byteLength,
			sha256: sha256(content),
		});
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
			formatVersion: 1,
			appName: "ridge",
			createdAt: createdAt.toISOString(),
			workspaceDir,
			ridgeDbPath,
			includePaths: plan.includePaths,
			excludePaths: plan.excludePaths,
			rebuildableIndexes: ["rag", "search_chunks"],
			files: files.sort((left, right) => left.path.localeCompare(right.path)),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const parseBackupManifest = (raw: string): BackupManifest => {
	const parsed = JSON.parse(raw) as unknown;
	if (!isRecord(parsed)) {
		throw new Error("Invalid backup manifest");
	}
	if (parsed["formatVersion"] !== 1 || parsed["appName"] !== "ridge") {
		throw new Error("Unsupported backup manifest");
	}
	if (
		typeof parsed["createdAt"] !== "string" ||
		typeof parsed["workspaceDir"] !== "string" ||
		typeof parsed["ridgeDbPath"] !== "string" ||
		!Array.isArray(parsed["includePaths"]) ||
		!Array.isArray(parsed["excludePaths"]) ||
		!Array.isArray(parsed["rebuildableIndexes"]) ||
		!Array.isArray(parsed["files"])
	) {
		throw new Error("Invalid backup manifest");
	}
	const files = parsed["files"].map((entry) => {
		if (
			!isRecord(entry) ||
			typeof entry["path"] !== "string" ||
			typeof entry["size"] !== "number" ||
			typeof entry["sha256"] !== "string"
		) {
			throw new Error("Invalid backup manifest file entry");
		}
		return {
			path: entry["path"],
			size: entry["size"],
			sha256: entry["sha256"],
		};
	});
	const rebuildableIndexes = parsed["rebuildableIndexes"];
	if (
		rebuildableIndexes.length !== 2 ||
		rebuildableIndexes[0] !== "rag" ||
		rebuildableIndexes[1] !== "search_chunks"
	) {
		throw new Error("Invalid backup rebuild index list");
	}
	return {
		formatVersion: 1,
		appName: "ridge",
		createdAt: parsed["createdAt"],
		workspaceDir: parsed["workspaceDir"],
		ridgeDbPath: parsed["ridgeDbPath"],
		includePaths: parsed["includePaths"].filter((entry): entry is string => typeof entry === "string"),
		excludePaths: parsed["excludePaths"].filter((entry): entry is string => typeof entry === "string"),
		rebuildableIndexes: ["rag", "search_chunks"],
		files,
	};
};

const assertSafeArchivePath = (archivePath: string): void => {
	if (
		archivePath.startsWith("/") ||
		archivePath.includes("\\") ||
		archivePath.split("/").some((part) => part === "..")
	) {
		throw new Error(`Unsafe backup path: ${archivePath}`);
	}
};

const restoreWorkspacePath = (workspaceDir: string, archivePath: string): string => {
	const relativePath = archivePath.slice("workspace/".length);
	assertSafeArchivePath(relativePath);
	return path.join(workspaceDir, relativePath);
};

export async function restoreServerBackupArchive(options: {
	archiveBuffer: Buffer;
	workspaceDir: string;
	ridgeDbPath: string;
	snapshotDir?: string;
	now?: () => Date;
	resetDatabaseConnection?: () => void;
	reopenDatabase?: () => Promise<unknown>;
}): Promise<ServerRestoreResult> {
	const workspaceDir = path.resolve(options.workspaceDir);
	const ridgeDbPath = path.resolve(options.ridgeDbPath);
	const createdAt = (options.now ?? (() => new Date()))();
	const restoreId = `${createdAt.toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
	const snapshotDir = path.resolve(
		options.snapshotDir ?? path.join(path.dirname(ridgeDbPath), "restore-snapshots"),
	);
	const zip = await JSZip.loadAsync(options.archiveBuffer);
	const manifestEntry = zip.file("backup-manifest.json");
	if (!manifestEntry) {
		throw new Error("Backup manifest is missing");
	}
	const manifest = parseBackupManifest(await manifestEntry.async("string"));
	const restoredFiles: string[] = [];

	for (const file of manifest.files) {
		assertSafeArchivePath(file.path);
		const entry = zip.file(file.path);
		if (!entry) {
			throw new Error(`Backup file listed in manifest is missing: ${file.path}`);
		}
		const content = await entry.async("nodebuffer");
		if (content.byteLength !== file.size || sha256(content) !== file.sha256) {
			throw new Error(`Backup checksum mismatch: ${file.path}`);
		}
	}

	const dbEntry = zip.file("server/ridge.db");
	if (!dbEntry) {
		throw new Error("Backup database is missing");
	}

	await fs.mkdir(snapshotDir, { recursive: true });
	const snapshot = await createServerBackupArchive({
		workspaceDir,
		ridgeDbPath,
		now: () => createdAt,
	});
	const preRestoreSnapshotPath = path.join(snapshotDir, `pre-restore-${restoreId}.zip`);
	await fs.writeFile(preRestoreSnapshotPath, snapshot.buffer);

	const tempWorkspaceDir = `${workspaceDir}.restore-${restoreId}`;
	const oldWorkspaceDir = `${workspaceDir}.before-restore-${restoreId}`;
	const tempDbPath = `${ridgeDbPath}.restore-${restoreId}`;
	const oldDbPath = `${ridgeDbPath}.before-restore-${restoreId}`;
	let movedWorkspace = false;
	let movedDb = false;

	try {
		await fs.rm(tempWorkspaceDir, { recursive: true, force: true });
		await fs.mkdir(tempWorkspaceDir, { recursive: true });
		for (const file of manifest.files) {
			const entry = zip.file(file.path);
			if (!entry) continue;
			if (file.path === "server/ridge.db") {
				await fs.mkdir(path.dirname(tempDbPath), { recursive: true });
				await fs.writeFile(tempDbPath, await entry.async("nodebuffer"));
				restoredFiles.push(file.path);
				continue;
			}
			if (!file.path.startsWith("workspace/")) continue;
			const targetPath = restoreWorkspacePath(tempWorkspaceDir, file.path);
			await fs.mkdir(path.dirname(targetPath), { recursive: true });
			await fs.writeFile(targetPath, await entry.async("nodebuffer"));
			restoredFiles.push(file.path);
		}

		options.resetDatabaseConnection?.();
		if (await pathExists(ridgeDbPath)) {
			await fs.rename(ridgeDbPath, oldDbPath);
			movedDb = true;
		}
		await fs.rename(tempDbPath, ridgeDbPath);

		if (await pathExists(workspaceDir)) {
			await fs.rename(workspaceDir, oldWorkspaceDir);
			movedWorkspace = true;
		}
		await fs.rename(tempWorkspaceDir, workspaceDir);

		await fs.rm(oldDbPath, { force: true });
		await fs.rm(oldWorkspaceDir, { recursive: true, force: true });
		await options.reopenDatabase?.();
	} catch (error) {
		options.resetDatabaseConnection?.();
		await fs.rm(ridgeDbPath, { force: true }).catch(() => undefined);
		if (movedDb) {
			await fs.rename(oldDbPath, ridgeDbPath).catch(() => undefined);
		}
		await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => undefined);
		if (movedWorkspace) {
			await fs.rename(oldWorkspaceDir, workspaceDir).catch(() => undefined);
		}
		await fs.rm(tempWorkspaceDir, { recursive: true, force: true }).catch(() => undefined);
		await fs.rm(tempDbPath, { force: true }).catch(() => undefined);
		await options.reopenDatabase?.().catch(() => undefined);
		throw error;
	}

	return {
		ok: true,
		preRestoreSnapshotPath,
		restoredFiles: restoredFiles.sort(),
		rebuildStatus: {
			rag: "pending",
			search_chunks: "pending",
		},
	};
}

export function createWorkspaceBackupRouter(options: {
	defaultWorkspaceDir: string;
	getRidgeDbPath: () => Promise<string>;
	createBackupArchive?: typeof createServerBackupArchive;
	restoreBackupArchive?: typeof restoreServerBackupArchive;
	resetDatabaseConnection?: () => void;
	reopenDatabase?: () => Promise<unknown>;
}) {
	const createBackupArchive = options.createBackupArchive ?? createServerBackupArchive;
	const restoreBackupArchive = options.restoreBackupArchive ?? restoreServerBackupArchive;
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

	router.post(
		"/api/workspace/restore",
		express.raw({ type: ["application/zip", "application/octet-stream"], limit: "2gb" }),
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!Buffer.isBuffer(req.body) || req.body.byteLength === 0) {
					const error = new Error("Backup archive body is required") as Error & { statusCode: number };
					error.statusCode = 400;
					throw error;
				}
				const result = await restoreBackupArchive({
					archiveBuffer: req.body,
					workspaceDir: options.defaultWorkspaceDir,
					ridgeDbPath: await options.getRidgeDbPath(),
					resetDatabaseConnection: options.resetDatabaseConnection,
					reopenDatabase: options.reopenDatabase,
				});
				res.json(result);
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
