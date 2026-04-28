import path from "node:path";
import type { Project } from "./types/index.js";

export const WORKSPACE_CHAT_PROJECT_ID = "ridge:workspace-chat";
export const WORKSPACE_CHAT_LABEL = "聊天";

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
	explicitWorkspaceDir?: string;
	platform: NodeJS.Platform;
	homeDir: string;
}): string => {
	if (options.explicitWorkspaceDir?.trim()) {
		return path.resolve(options.explicitWorkspaceDir);
	}

	if (options.platform === "darwin") {
		return path.resolve(options.homeDir, "ridge-workspace");
	}

	throw new Error(
		"非 macOS 环境必须显式设置 PI_WORKSPACE_DIR，禁止默认回落到源码目录",
	);
};
