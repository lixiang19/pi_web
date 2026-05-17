import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ===== 类型 =====

export type EngineKind = "cli" | "none";

export interface GitContext {
	engine: EngineKind;
	workTree: string;
	gitdir: string | null;
	isRepository: boolean;
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
				isRepository: true,
				canCommit: true,
				canPushPull: true,
				canWorktree: true,
				label: "Git",
			};
		} catch {
			// .git 不存在，fall through to iso
		}
	}

	return {
		engine: "none",
		workTree: projectPath,
		gitdir: null,
		isRepository: false,
		canCommit: false,
		canPushPull: false,
		canWorktree: false,
		label: "非 Git 仓库",
	};
}
