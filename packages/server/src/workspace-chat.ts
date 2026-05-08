import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "./types/index.js";

export const WORKSPACE_CHAT_PROJECT_ID = "ridge:workspace-chat";
export const WORKSPACE_CHAT_LABEL = "聊天";
export const DEFAULT_WORKSPACE_DIR_NAME = "ridge-workspace";
export const WORKSPACE_TEMPLATE_DIRS = [
	"收件箱",
	"日记",
	"笔记",
	"项目",
	"阅读",
	"数据库",
] as const;

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
	await fs.mkdir(workspaceDir, { recursive: true });
	await Promise.all(
		WORKSPACE_TEMPLATE_DIRS.map((directory) =>
			fs.mkdir(path.join(workspaceDir, directory), { recursive: true }),
		),
	);
};
