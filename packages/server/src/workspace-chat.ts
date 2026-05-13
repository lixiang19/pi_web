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

const isNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
	error instanceof Error &&
	"code" in error &&
	(error as NodeJS.ErrnoException).code === "ENOENT";

const ensureDirectory = async (targetPath: string, label: string) => {
	try {
		const stat = await fs.stat(targetPath);
		if (!stat.isDirectory()) {
			throw new Error(`${label} exists but is not a directory: ${targetPath}`);
		}
	} catch (error) {
		if (!isNotFoundError(error)) {
			throw error;
		}
		await fs.mkdir(targetPath, { recursive: true });
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
		if (!isNotFoundError(error)) {
			throw error;
		}
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
	await Promise.all(
		WORKSPACE_TEMPLATE_DIRS.map((directory) =>
			ensureDirectory(
				path.join(workspaceDir, directory),
				"Workspace template path",
			),
		),
	);
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
