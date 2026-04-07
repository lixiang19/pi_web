import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const normalizePath = (value) => path.resolve(value);

const isPathInsideRoot = (candidatePath, rootPath) => {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const parseBranchName = (value) => value.replace(/^refs\/heads\//, '').trim();

const parseWorktreeList = (content) => {
  const items = [];
  const lines = content.split(/\r?\n/);
  let current = null;

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

const getBasename = (value) => path.basename(value) || value;

const getContainingWorktree = (cwd, worktrees) => worktrees
  .filter((item) => isPathInsideRoot(cwd, item.path))
  .sort((left, right) => right.path.length - left.path.length)[0];

async function runGit(cwd, args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args]);
  return stdout.trim();
}

export function createProjectContextResolver(workspaceDir) {
  const contextCache = new Map();
  let workspaceScopePromise = null;

  const resolveContext = async (cwd) => {
    const normalizedCwd = normalizePath(cwd || workspaceDir);
    if (contextCache.has(normalizedCwd)) {
      return contextCache.get(normalizedCwd);
    }

    const pending = (async () => {
      try {
        const [topLevel, commonDir, worktreeOutput] = await Promise.all([
          runGit(normalizedCwd, ['rev-parse', '--show-toplevel']),
          runGit(normalizedCwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
          runGit(normalizedCwd, ['worktree', 'list', '--porcelain']),
        ]);

        const worktrees = parseWorktreeList(worktreeOutput);
        const worktreesWithGitDir = await Promise.all(worktrees.map(async (item) => ({
          ...item,
          gitDir: normalizePath(await runGit(item.path, ['rev-parse', '--path-format=absolute', '--git-dir'])),
        })));

        const containingWorktree = getContainingWorktree(normalizedCwd, worktreesWithGitDir)
          ?? {
            path: normalizePath(topLevel),
            branch: undefined,
            gitDir: normalizePath(commonDir),
          };

        const projectRootWorktree = worktreesWithGitDir.find((item) => item.gitDir === normalizePath(commonDir))
          ?? containingWorktree;

        return {
          isGit: true,
          projectId: normalizePath(commonDir),
          projectRoot: projectRootWorktree.path,
          projectLabel: getBasename(projectRootWorktree.path),
          worktreeRoot: containingWorktree.path,
          worktreeLabel: containingWorktree.branch || getBasename(containingWorktree.path),
          branch: containingWorktree.branch,
          worktrees: worktreesWithGitDir.map((item) => ({
            path: item.path,
            branch: item.branch,
            label: item.branch || getBasename(item.path),
          })),
        };
      } catch (_error) {
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

  const resolveWorkspaceScope = async () => {
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