import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "./types/index.js";

export const WORKSPACE_CHAT_PROJECT_ID = "ridge:workspace-chat";
export const WORKSPACE_CHAT_DIRECTORY = "chat";
export const WORKSPACE_CHAT_LABEL = "聊天";

export interface WorkspaceChatConfig {
  workspaceDir: string;
  chatProjectId: string;
  chatProjectPath: string;
  chatProjectLabel: string;
}

export const getWorkspaceChatConfig = (
  workspaceDir: string,
): WorkspaceChatConfig => ({
  workspaceDir: path.resolve(workspaceDir),
  chatProjectId: WORKSPACE_CHAT_PROJECT_ID,
  chatProjectPath: path.join(path.resolve(workspaceDir), WORKSPACE_CHAT_DIRECTORY),
  chatProjectLabel: WORKSPACE_CHAT_LABEL,
});

export const createWorkspaceChatProject = (
  config: WorkspaceChatConfig,
): Project => ({
  id: config.chatProjectId,
  name: config.chatProjectLabel,
  path: config.chatProjectPath,
  addedAt: 0,
  isGit: false,
});

export const getWorkspaceChatTemplateDir = (rootDir: string) =>
  path.join(path.resolve(rootDir), "packages/server/templates/chat");

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

export const ensureWorkspaceChatProject = async (options: {
  workspaceDir: string;
  templateDir: string;
}): Promise<WorkspaceChatConfig> => {
  const config = getWorkspaceChatConfig(options.workspaceDir);
  await fs.mkdir(config.workspaceDir, { recursive: true });

  let stats: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    stats = await fs.stat(config.chatProjectPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (stats) {
    if (!stats.isDirectory()) {
      throw new Error(`工作区 chat 路径已存在但不是目录: ${config.chatProjectPath}`);
    }
    return config;
  }

  await fs.cp(options.templateDir, config.chatProjectPath, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  return config;
};
