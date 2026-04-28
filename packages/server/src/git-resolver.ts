import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getProjects } from "./storage/index.js";
import { getDataDir } from "./utils/paths.js";

const execFileAsync = promisify(execFile);

// ===== 类型 =====

export type EngineKind = "cli" | "iso";

export interface GitContext {
	engine: EngineKind;
	workTree: string;
	gitdir: string;
	canCommit: boolean;
	canPushPull: boolean;
	canWorktree: boolean;
	label: string;
}

// ===== 系统 git 可用性（进程级缓存） =====

let systemGitAvailable: boolean | null = null;

async function detectSystemGit(): Promise<boolean> {
	try {
		await execFileAsync("git", ["--version"]);
		return true;
	} catch {
		return false;
	}
}

export async function hasSystemGit(): Promise<boolean> {
	if (systemGitAvailable === null) {
		systemGitAvailable = await detectSystemGit();
	}
	return systemGitAvailable;
}

// ===== 从 cwd 反查 projectId =====

async function resolveProjectId(cwd: string): Promise<string> {
	const state = await getProjects();
	const normalized = path.resolve(cwd);
	const project = state.projects.find(
		(p) => path.resolve(p.path) === normalized,
	);
	// 找不到匹配项目时用路径 hash 作为 fallback
	return project?.id || Buffer.from(normalized).toString("hex").slice(0, 16);
}

// ===== 解析仓库上下文 =====

export async function resolveGitContext(cwd: string): Promise<GitContext> {
	const projectPath = cwd;

	// CLI 引擎：系统有 git 且项目有 .git
	if (await hasSystemGit()) {
		const dotGit = path.join(projectPath, ".git");
		try {
			await fs.access(dotGit);
			return {
				engine: "cli",
				workTree: projectPath,
				gitdir: dotGit,
				canCommit: true,
				canPushPull: true,
				canWorktree: true,
				label: "Git",
			};
		} catch {
			// .git 不存在，fall through to iso
		}
	}

	// Iso 引擎
	const projectId = await resolveProjectId(projectPath);
	const isoGitdir = path.join(getDataDir(), "ridge-git", projectId);

	return {
		engine: "iso",
		workTree: projectPath,
		gitdir: isoGitdir,
		canCommit: true,
		canPushPull: false,
		canWorktree: false,
		label: "ridge 内置",
	};
}
