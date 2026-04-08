import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProjectContext, WorkspaceScope } from './types/index.js';

const execFileAsync = promisify(execFile);

const normalizePath = (value: string): string => path.resolve(value);

const isPathInsideRoot = (candidatePath: string, rootPath: string): boolean => {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

const parseBranchName = (value: string): string => value.replace(/^refs\/heads\//, '').trim();

interface GitWorktreeItem {
  path: string;
  branch?: string;
  gitDir?: string;
}

const parseWorktreeList = (content: string): GitWorktreeItem[] => {
  const items: GitWorktreeItem[] = [];
  const lines = content.split(/\r?\n/);
  let current: GitWorktreeItem | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      if (current) {
        items.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith('worktree ')) {
      if (current) {
        items.push(current);
      }

      current = {
        path: normalizePath(line.slice('worktree '.length).trim()),
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('branch ')) {
      current.branch = parseBranchName(line.slice('branch '.length));
    }
  }

  if (current) {
    items.push(current);
  }

  return items;
};

const getBasename = (value: string): string => path.basename(value) || value;

const getContainingWorktree = (cwd: string, worktrees: GitWorktreeItem[]): GitWorktreeItem | undefined =>
  worktrees
    .filter((item) => isPathInsideRoot(cwd, item.path))
    .sort((left, right) => right.path.length - left.path.length)[0];

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args]);
  return stdout.trim();
}

export interface ProjectContextResolver {
  resolveContext(cwd: string): Promise<ProjectContext>;
  resolveWorkspaceScope(): Promise<WorkspaceScope>;
  isPathInsideRoot(candidatePath: string, rootPath: string): boolean;
}

export function createProjectContextResolver(workspaceDir: string): ProjectContextResolver {
  const contextCache = new Map<string, Promise<ProjectContext>>();
  let workspaceScopePromise: Promise<WorkspaceScope> | null = null;

  const resolveContext = async (cwd: string): Promise<ProjectContext> => {
    const normalizedCwd = normalizePath(cwd || workspaceDir);
    if (contextCache.has(normalizedCwd)) {
      return contextCache.get(normalizedCwd)!;
    }

    const pending = (async (): Promise<ProjectContext> => {
      try {
        const [topLevel, commonDir, worktreeOutput] = await Promise.all([
          runGit(normalizedCwd, ['rev-parse', '--show-toplevel']),
          runGit(normalizedCwd, [
            'rev-parse',
            '--path-format=absolute',
            '--git-common-dir',
          ]),
          runGit(normalizedCwd, ['worktree', 'list', '--porcelain']),
        ]);

        const worktrees = parseWorktreeList(worktreeOutput);
        const worktreesWithGitDir = await Promise.all(
          worktrees.map(async (item) => ({
            ...item,
            gitDir: normalizePath(
              await runGit(item.path, [
                'rev-parse',
                '--path-format=absolute',
                '--git-dir',
              ]),
            ),
          })),
        );

        const containingWorktree = getContainingWorktree(
          normalizedCwd,
          worktreesWithGitDir,
        ) ?? {
          path: normalizePath(topLevel),
          branch: undefined,
          gitDir: normalizePath(commonDir),
        };

        const projectRootWorktree =
          worktreesWithGitDir.find(
            (item) => item.gitDir === normalizePath(commonDir),
          ) ?? containingWorktree;

        return {
          isGit: true,
          projectId: normalizePath(commonDir),
          projectRoot: projectRootWorktree.path,
          projectLabel: getBasename(projectRootWorktree.path),
          worktreeRoot: containingWorktree.path,
          worktreeLabel:
            containingWorktree.branch || getBasename(containingWorktree.path),
          branch: containingWorktree.branch,
          worktrees: worktreesWithGitDir.map((item) => ({
            path: item.path,
            branch: item.branch,
            label: item.branch || getBasename(item.path),
          })),
        };
      } catch {
        return {
          isGit: false,
          projectId: normalizedCwd,
          projectRoot: normalizedCwd,
          projectLabel: getBasename(normalizedCwd),
          worktreeRoot: normalizedCwd,
          worktreeLabel: getBasename(normalizedCwd),
          branch: undefined,
          worktrees: [
            {
              path: normalizedCwd,
              branch: undefined,
              label: getBasename(normalizedCwd),
            },
          ],
        };
      }
    })();

    contextCache.set(normalizedCwd, pending);
    return pending;
  };

  const resolveWorkspaceScope = async (): Promise<WorkspaceScope> => {
    if (workspaceScopePromise) {
      return workspaceScopePromise;
    }

    workspaceScopePromise = (async () => {
      const workspaceContext = await resolveContext(workspaceDir);
      const allowedRoots = new Set([normalizePath(workspaceDir)]);

      for (const worktree of workspaceContext.worktrees) {
        allowedRoots.add(worktree.path);
      }

      return {
        workspaceProjectId: workspaceContext.projectId,
        allowedRoots: [...allowedRoots],
      };
    })();

    return workspaceScopePromise;
  };

  return {
    resolveContext,
    resolveWorkspaceScope,
    isPathInsideRoot,
  };
}
