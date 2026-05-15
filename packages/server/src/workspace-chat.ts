import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "./types/index.js";

export const WORKSPACE_CHAT_PROJECT_ID = "ridge:workspace-chat";
export const WORKSPACE_CHAT_LABEL = "聊天";
export const DEFAULT_WORKSPACE_DIR_NAME = "ridge-workspace";
export const WORKSPACE_VISIBLE_DIRS = [
	"项目",
	"笔记",
	"日记",
	"剪藏",
	"附件",
	"记忆",
	"Wiki",
	"空间",
] as const;
export const WORKSPACE_SYSTEM_DIRS = [".ridge"] as const;
export const RIDGE_SYSTEM_SUBDIRS = [
	"fleeting-attachments",
	"rag",
	"graph.kuzu",
	"cache",
	"runtime",
] as const;
export const WORKSPACE_TEMPLATE_DIRS = [
	...WORKSPACE_VISIBLE_DIRS,
	...WORKSPACE_SYSTEM_DIRS,
] as const;

const ensureDirectory = async (targetPath: string, label: string) => {
	try {
		const stat = await fs.stat(targetPath);
		if (!stat.isDirectory()) {
			throw new Error(`${label} exists but is not a directory: ${targetPath}`);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("exists but is not a directory")) {
			throw error;
		}
		// ENOENT or other stat errors → attempt to create the directory.
		// fs.mkdir with recursive: true is idempotent and handles races.
		// Retry once on transient errors (EBUSY/ENOTEMPTY from concurrent cleanup).
		try {
			await fs.mkdir(targetPath, { recursive: true });
		} catch (mkdirError) {
			if (
				(mkdirError instanceof Error && 'code' in mkdirError) &&
				((mkdirError as NodeJS.ErrnoException).code === "EBUSY" ||
					(mkdirError as NodeJS.ErrnoException).code === "ENOTEMPTY")
			) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				await fs.mkdir(targetPath, { recursive: true });
			} else {
				throw mkdirError;
			}
		}
	}
};

const ensureInitialMarkdownFile = async (
	filePath: string,
	initialContent: string,
) => {
	try {
		const stat = await fs.stat(filePath);
		if (!stat.isFile()) {
			throw new Error(
				`Workspace template file path exists but is not a file: ${filePath}`,
			);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("exists but is not a file")) {
			throw error;
		}
		// Any stat error (ENOENT, EPERM, etc.) → write the file.
		await fs.writeFile(filePath, initialContent, "utf8");
	}
};

export interface WorkspaceChatConfig {
	workspaceDir: string;
	chatProjectId: string;
	chatProjectPath: string;
	chatProjectLabel: string;
}

export const getWorkspaceChatConfig = (
	workspaceDir: string,
): WorkspaceChatConfig => {
	const resolved = path.resolve(workspaceDir);
	return {
		workspaceDir: resolved,
		chatProjectId: WORKSPACE_CHAT_PROJECT_ID,
		chatProjectPath: resolved,
		chatProjectLabel: WORKSPACE_CHAT_LABEL,
	};
};

export const createWorkspaceChatProject = (
	config: WorkspaceChatConfig,
): Project => ({
	id: config.chatProjectId,
	name: config.chatProjectLabel,
	path: config.chatProjectPath,
	addedAt: 0,
	isGit: false,
	projectType: 'workspace',
	externalOrigin: null,
	isOnline: false,
	updatedAt: 0,
});

export const resolveDefaultWorkspaceDir = (options: {
	homeDir: string;
	storedWorkspaceDir?: string | null;
}): string => {
	if (options.storedWorkspaceDir?.trim()) {
		return path.resolve(options.storedWorkspaceDir);
	}

	return path.resolve(options.homeDir, DEFAULT_WORKSPACE_DIR_NAME);
};

export const ensureWorkspaceTemplate = async (workspaceDir: string) => {
	await ensureDirectory(
		workspaceDir,
		"Workspace path",
	);
	// Validate all directories first (sequential) to avoid partial creation on error.
	// Parallel creation can leave orphaned directories when one path fails (e.g., a file
	// exists where a directory is expected), causing subsequent cleanup to fail.
	for (const directory of WORKSPACE_TEMPLATE_DIRS) {
		await ensureDirectory(
			path.join(workspaceDir, directory),
			"Workspace template path",
		);
	}
	await Promise.all([
		...RIDGE_SYSTEM_SUBDIRS.map((directory) =>
			ensureDirectory(
				path.join(workspaceDir, ".ridge", directory),
				"Workspace ridge system path",
			),
		),
		ensureInitialMarkdownFile(
			path.join(workspaceDir, "记忆", "MEMORY.md"),
			"# MEMORY\n",
		),
		ensureInitialMarkdownFile(
			path.join(workspaceDir, "Wiki", "index.md"),
			"# Wiki\n",
		),
	]);
};
