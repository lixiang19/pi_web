import fs from "node:fs";
import path from "node:path";
import * as isoGit from "isomorphic-git";

import type { GitFileStatus, GitStatusResult } from "./git-service.js";

// ===== 内置 Git 提交者身份 =====

const RIDGE_AUTHOR = { name: "ridge", email: "ridge@local" };

// ===== 内置 gitdir 的 exclude 模板 =====

const EXCLUDE_PATTERNS = [
	".git",
	"node_modules",
	"dist",
	"build",
	"target",
	".next",
	".turbo",
	"coverage",
	".pi-web",
	".DS_Store",
];

// ===== 类型 =====

export interface IsoGitContext {
	workTree: string;
	gitdir: string;
}

// ===== statusMatrix 值常量 =====

// isomorphic-git statusMatrix 返回 [filepath, head, workdir, stage]
// 0 = absent, 1 = tree (unchanged), 2 = modified, 3 = added

const ABSENT = 0;
const UNCHANGED = 1;
const MODIFIED = 2;
const ADDED = 3;

// ===== 转换: statusMatrix → GitStatusResult =====

function convertStatusMatrix(
	matrix: [string, number, number, number][],
	branch: string | null,
): GitStatusResult {
	const files: GitFileStatus[] = [];

	for (const row of matrix) {
		const [filepath, head, workdir, stage] = row;

		// 三状态都是 UNCHANGED → 无变更，跳过
		if (head === UNCHANGED && workdir === UNCHANGED && stage === UNCHANGED)
			continue;

		// 排除 .git 目录自身
		if (filepath === ".git" || filepath.startsWith(".git/")) continue;

		let index = " ";
		let working_dir = " ";

		// === index 列（staging area vs HEAD） ===
		if (head === ABSENT && stage !== ABSENT) {
			index = "A";
		} else if (head !== ABSENT && stage === ADDED) {
			index = "A";
		} else if (stage === MODIFIED) {
			index = "M";
		} else if (stage === ABSENT && head !== ABSENT) {
			index = "D";
		}

		// === working_dir 列（workdir vs staging） ===
		if (workdir === MODIFIED) {
			working_dir = "M";
		} else if (workdir === ABSENT && head !== ABSENT) {
			working_dir = "D";
		} else if (head === ABSENT && workdir !== ABSENT && stage === ABSENT) {
			// untracked
			working_dir = "?";
			index = "?";
		}

		files.push({ path: filepath, index, working_dir });
	}

	return {
		current: branch || "main",
		tracking: null,
		files,
		ahead: 0,
		behind: 0,
	};
}

// ===== IsoGitService =====

export function createIsoGitService() {
	/** 确保 gitdir 已初始化（幂等） */
	const ensureInit = async (ctx: IsoGitContext): Promise<void> => {
		const headPath = path.join(ctx.gitdir, "HEAD");
		try {
			await fs.promises.access(headPath);
		} catch {
			await fs.promises.mkdir(ctx.gitdir, { recursive: true });
			await isoGit.init({
				fs,
				dir: ctx.workTree,
				gitdir: ctx.gitdir,
				defaultBranch: "main",
			});

			// 写入 exclude 文件
			const infoDir = path.join(ctx.gitdir, "info");
			await fs.promises.mkdir(infoDir, { recursive: true });
			await fs.promises.writeFile(
				path.join(infoDir, "exclude"),
				EXCLUDE_PATTERNS.join("\n") + "\n",
				"utf-8",
			);
		}
	};

	/** 获取当前分支名 */
	const getCurrentBranch = async (ctx: IsoGitContext): Promise<string> => {
		await ensureInit(ctx);
		const branch = await isoGit.currentBranch({
			fs,
			dir: ctx.workTree,
			gitdir: ctx.gitdir,
		});
		return branch || "main";
	};

	/** 获取 status（转换为 GitStatusResult） */
	const getStatus = async (ctx: IsoGitContext): Promise<GitStatusResult> => {
		await ensureInit(ctx);

		const branch = await getCurrentBranch(ctx);

		const matrix = await isoGit.statusMatrix({
			fs,
			dir: ctx.workTree,
			gitdir: ctx.gitdir,
		});

		return convertStatusMatrix(
			matrix as [string, number, number, number][],
			branch,
		);
	};

	/** add + commit */
	const commit = async (
		ctx: IsoGitContext,
		message: string,
		files: string[],
	): Promise<{ hash: string }> => {
		await ensureInit(ctx);

		for (const f of files) {
			await isoGit.add({
				fs,
				dir: ctx.workTree,
				gitdir: ctx.gitdir,
				filepath: f,
			});
		}

		const sha = await isoGit.commit({
			fs,
			dir: ctx.workTree,
			gitdir: ctx.gitdir,
			message,
			author: RIDGE_AUTHOR,
		});

		return { hash: sha.slice(0, 12) };
	};

	/** 获取分支列表（iso 模式只有当前分支） */
	const getBranches = async (
		ctx: IsoGitContext,
	): Promise<{
		current: string | null;
		all: string[];
		branches: Record<string, { current: boolean }>;
	}> => {
		await ensureInit(ctx);

		const branch = await getCurrentBranch(ctx);
		return {
			current: branch,
			all: [branch],
			branches: { [branch]: { current: true } },
		};
	};

	return {
		ensureInit,
		getCurrentBranch,
		getStatus,
		commit,
		getBranches,
	};
}

export type IsoGitService = ReturnType<typeof createIsoGitService>;
