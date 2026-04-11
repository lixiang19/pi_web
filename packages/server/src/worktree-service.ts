import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { GitService, GitWorktreeEntry } from './git-service.js';

// ===== Types =====

export interface WorktreeMetadata {
  path: string;
  branch?: string;
  label: string;
  projectRoot: string;
}

export interface CreateWorktreePayload {
  mode: 'new' | 'existing';
  branchName?: string;
  existingBranch?: string;
  worktreeName?: string;
  startRef?: string;
}

export interface ValidateWorktreePayload {
  mode: 'new' | 'existing';
  branchName?: string;
  existingBranch?: string;
  worktreeName?: string;
}

export interface ValidateWorktreeResult {
  ok: boolean;
  branchError?: string;
  worktreeError?: string;
  resolvedPath?: string;
}

export interface DeleteWorktreePayload {
  worktreePath: string;
  deleteLocalBranch?: boolean;
  deleteRemoteBranch?: boolean;
}

// ===== Helpers =====

const DATA_DIR_NAME = '.ridge';

const slugify = (value: string): string =>
  value
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/\s+/g, '-')
    .split('/')
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const getWorktreeBaseDir = (): string =>
  path.join(os.homedir(), DATA_DIR_NAME, 'worktrees');

const getProjectSlug = (projectRoot: string): string => {
  const basename = path.basename(projectRoot);
  return slugify(basename) || 'project';
};

const resolveWorktreePath = (projectRoot: string, worktreeName: string): string => {
  const projectSlug = getProjectSlug(projectRoot);
  const nameSlug = slugify(worktreeName);
  if (!nameSlug) throw new Error('worktreeName is empty after slugification');
  return path.join(getWorktreeBaseDir(), projectSlug, nameSlug);
};

const normalizePath = (value: string): string =>
  value.replace(/\\/g, '/').replace(/\/+$/, '');

// ===== Service =====

export interface WorktreeService {
  list(projectRoot: string): Promise<WorktreeMetadata[]>;
  validate(projectRoot: string, payload: ValidateWorktreePayload): Promise<ValidateWorktreeResult>;
  create(projectRoot: string, payload: CreateWorktreePayload): Promise<WorktreeMetadata>;
  remove(projectRoot: string, payload: DeleteWorktreePayload): Promise<{ deletedBranch?: string }>;
}

export function createWorktreeService(git: GitService): WorktreeService {
  const list = async (projectRoot: string): Promise<WorktreeMetadata[]> => {
    const entries = await git.worktreeList(projectRoot);
    const normalizedRoot = normalizePath(path.resolve(projectRoot));

    return entries
      .filter((entry): entry is GitWorktreeEntry & { path: string } =>
        typeof entry.path === 'string' && entry.path.trim().length > 0,
      )
      .map((entry) => ({
        path: normalizePath(path.resolve(entry.path)),
        branch: entry.branch,
        label: entry.branch || path.basename(entry.path) || entry.path,
        projectRoot: normalizedRoot,
      }))
      .filter((entry) => normalizePath(entry.path) !== normalizedRoot);
  };

  const validate = async (
    projectRoot: string,
    payload: ValidateWorktreePayload,
  ): Promise<ValidateWorktreeResult> => {
    const errors: { branchError?: string; worktreeError?: string } = {};

    const worktreeName = payload.worktreeName || payload.branchName || payload.existingBranch || '';
    if (!worktreeName.trim()) {
      errors.worktreeError = 'worktree 名称不能为空';
      return { ok: false, ...errors };
    }

    const resolvedPath = resolveWorktreePath(projectRoot, worktreeName);

    try {
      await fs.access(resolvedPath);
      errors.worktreeError = `目录已存在: ${resolvedPath}`;
    } catch {
      // 目录不存在，没问题
    }

    if (payload.mode === 'new') {
      const branchName = payload.branchName;
      if (!branchName?.trim()) {
        errors.branchError = '新分支名称不能为空';
      } else {
        try {
          const branches = await git.getBranches(projectRoot);
          const localBranches = branches.all.filter((b) => !b.startsWith('remotes/'));
          if (localBranches.includes(branchName.trim())) {
            errors.branchError = `分支已存在: ${branchName}`;
          }
        } catch {
          // 无法获取分支信息，跳过检查
        }
      }
    } else if (payload.mode === 'existing') {
      const existingBranch = payload.existingBranch;
      if (!existingBranch?.trim()) {
        errors.branchError = '请选择要挂出的分支';
      } else {
        try {
          const branches = await git.getBranches(projectRoot);
          if (!branches.all.includes(existingBranch.trim())) {
            errors.branchError = `分支不存在: ${existingBranch}`;
          }
        } catch {
          // 无法获取分支信息，跳过检查
        }
      }
    }

    const hasErrors = Boolean(errors.branchError || errors.worktreeError);
    return {
      ok: !hasErrors,
      ...errors,
      resolvedPath: normalizePath(resolvedPath),
    };
  };

  const create = async (
    projectRoot: string,
    payload: CreateWorktreePayload,
  ): Promise<WorktreeMetadata> => {
    const worktreeName = payload.worktreeName || payload.branchName || payload.existingBranch || '';
    if (!worktreeName.trim()) {
      throw new Error('worktree 名称不能为空');
    }

    const targetPath = resolveWorktreePath(projectRoot, worktreeName);

    // 确保父目录存在
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (payload.mode === 'new') {
      const branchName = payload.branchName?.trim();
      if (!branchName) throw new Error('新分支名称不能为空');
      await git.worktreeAdd(projectRoot, targetPath, {
        newBranch: branchName,
        startPoint: payload.startRef || undefined,
      });
    } else {
      const existingBranch = payload.existingBranch?.trim();
      if (!existingBranch) throw new Error('请选择要挂出的分支');
      await git.worktreeAdd(projectRoot, targetPath, {
        branch: existingBranch,
      });
    }

    const branch = payload.mode === 'new'
      ? payload.branchName?.trim()
      : payload.existingBranch?.trim();

    return {
      path: normalizePath(path.resolve(targetPath)),
      branch,
      label: branch || path.basename(targetPath),
      projectRoot: normalizePath(path.resolve(projectRoot)),
    };
  };

  const remove = async (
    projectRoot: string,
    payload: DeleteWorktreePayload,
  ): Promise<{ deletedBranch?: string }> => {
    const resolvedPath = path.resolve(payload.worktreePath);

    // 先从 worktree 列表中找到分支名
    const worktrees = await git.worktreeList(projectRoot);
    const target = worktrees.find(
      (entry) => normalizePath(path.resolve(entry.path)) === normalizePath(resolvedPath),
    );
    const branchName = target?.branch;

    // 删除 worktree
    await git.worktreeRemove(projectRoot, resolvedPath);

    // 删除本地分支
    if (payload.deleteLocalBranch !== false && branchName) {
      try {
        await git.deleteBranch(projectRoot, branchName, { force: true });
      } catch {
        // 分支可能已删除或在其他 worktree 中使用
      }
    }

    // 删除远程分支
    if (payload.deleteRemoteBranch !== false && branchName) {
      try {
        const remotes = await git.getRemotes(projectRoot);
        const originRemote = remotes.find((r) => r.name === 'origin');
        if (originRemote) {
          await git.deleteRemoteBranch(projectRoot, 'origin', branchName);
        }
      } catch {
        // 远程分支可能不存在
      }
    }

    return { deletedBranch: branchName };
  };

  return { list, validate, create, remove };
}
