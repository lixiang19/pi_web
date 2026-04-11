import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ===== Types =====

export interface GitFileStatus {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitStatusResult {
  current: string | null;
  tracking: string | null;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
}

export interface GitBranchesResult {
  current: string | null;
  all: string[];
  branches: Record<string, { current: boolean; tracking?: string }>;
}

export interface GitWorktreeEntry {
  path: string;
  branch?: string;
  head?: string;
  bare?: boolean;
}

export interface GitDiffStat {
  path: string;
  additions: number;
  deletions: number;
}

// ===== Internal Helpers =====

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout.trimEnd();
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message?: string };
    const detail = execError.stderr?.trim() || execError.message || 'unknown error';
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

function parseBranchName(value: string): string {
  return value.replace(/^refs\/heads\//, '').trim();
}

// ===== Service =====

export interface GitService {
  isGitRepository(cwd: string): Promise<boolean>;
  getStatus(cwd: string): Promise<GitStatusResult>;
  getBranches(cwd: string): Promise<GitBranchesResult>;
  getRemotes(cwd: string): Promise<GitRemoteInfo[]>;

  fetch(cwd: string, options?: { remote?: string; branch?: string }): Promise<void>;
  pull(cwd: string, options?: { remote?: string }): Promise<void>;
  push(cwd: string, options?: { remote?: string; branch?: string; force?: boolean }): Promise<void>;

  commit(cwd: string, message: string, files: string[]): Promise<{ hash: string }>;
  getDiffStats(cwd: string): Promise<{ staged: GitDiffStat[]; unstaged: GitDiffStat[] }>;

  createBranch(cwd: string, branchName: string, fromRef?: string): Promise<void>;
  checkoutBranch(cwd: string, branchName: string): Promise<void>;
  renameBranch(cwd: string, oldName: string, newName: string): Promise<void>;
  deleteBranch(cwd: string, branchName: string, options?: { force?: boolean }): Promise<void>;
  deleteRemoteBranch(cwd: string, remoteName: string, branchName: string): Promise<void>;

  merge(cwd: string, branchName: string): Promise<void>;
  rebase(cwd: string, branchName: string): Promise<void>;

  worktreeList(cwd: string): Promise<GitWorktreeEntry[]>;
  worktreeAdd(cwd: string, targetPath: string, options: { branch?: string; newBranch?: string; startPoint?: string }): Promise<void>;
  worktreeRemove(cwd: string, worktreePath: string): Promise<void>;
}

export function createGitService(): GitService {
  const isGitRepository = async (cwd: string): Promise<boolean> => {
    try {
      await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
      return true;
    } catch {
      return false;
    }
  };

  const getStatus = async (cwd: string): Promise<GitStatusResult> => {
    const output = await runGit(cwd, ['status', '--porcelain=v2', '--branch', '-z']);
    const entries = output.split('\0').filter(Boolean);

    let current: string | null = null;
    let tracking: string | null = null;
    let ahead = 0;
    let behind = 0;
    const files: GitFileStatus[] = [];

    for (const entry of entries) {
      if (entry.startsWith('# branch.head ')) {
        current = entry.slice('# branch.head '.length).trim();
        if (current === '(detached)') current = null;
      } else if (entry.startsWith('# branch.upstream ')) {
        tracking = entry.slice('# branch.upstream '.length).trim();
      } else if (entry.startsWith('# branch.ab ')) {
        const match = entry.match(/\+(\d+)\s+-(\d+)/);
        if (match) {
          ahead = parseInt(match[1], 10);
          behind = parseInt(match[2], 10);
        }
      } else if (entry.startsWith('1 ') || entry.startsWith('2 ')) {
        // Changed entries: "1 XY ..." or "2 XY ..."
        const xy = entry.slice(2, 4);
        const pathPart = entry.startsWith('2 ')
          ? entry.split('\t').pop() ?? entry.split(' ').pop() ?? ''
          : entry.slice(entry.lastIndexOf(' ') + 1);
        files.push({
          path: pathPart.trim(),
          index: xy[0],
          working_dir: xy[1],
        });
      } else if (entry.startsWith('u ')) {
        // Unmerged entries
        const parts = entry.split(' ');
        const filePath = parts[parts.length - 1];
        files.push({ path: filePath.trim(), index: 'U', working_dir: 'U' });
      } else if (entry.startsWith('? ')) {
        // Untracked
        const filePath = entry.slice(2);
        files.push({ path: filePath.trim(), index: '?', working_dir: '?' });
      }
    }

    return { current, tracking, files, ahead, behind };
  };

  const getBranches = async (cwd: string): Promise<GitBranchesResult> => {
    const output = await runGit(cwd, ['branch', '-a', '--format=%(HEAD)%(refname:short)\t%(upstream:short)']);
    const lines = output.split('\n').filter(Boolean);

    let current: string | null = null;
    const all: string[] = [];
    const branches: Record<string, { current: boolean; tracking?: string }> = {};

    for (const line of lines) {
      const isCurrent = line.startsWith('*');
      const rest = isCurrent ? line.slice(1) : line;
      const [name, upstream] = rest.split('\t').map((s) => s.trim());
      if (!name) continue;

      all.push(name);
      branches[name] = {
        current: isCurrent,
        ...(upstream ? { tracking: upstream } : {}),
      };

      if (isCurrent) {
        current = name;
      }
    }

    return { current, all, branches };
  };

  const getRemotes = async (cwd: string): Promise<GitRemoteInfo[]> => {
    const output = await runGit(cwd, ['remote', '-v']);
    const lines = output.split('\n').filter(Boolean);
    const remoteMap = new Map<string, { fetchUrl: string; pushUrl: string }>();

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match) continue;
      const [, name, url, type] = match;
      const existing = remoteMap.get(name) ?? { fetchUrl: '', pushUrl: '' };
      if (type === 'fetch') existing.fetchUrl = url;
      if (type === 'push') existing.pushUrl = url;
      remoteMap.set(name, existing);
    }

    return [...remoteMap.entries()].map(([name, urls]) => ({
      name,
      fetchUrl: urls.fetchUrl,
      pushUrl: urls.pushUrl,
    }));
  };

  const fetchCmd = async (cwd: string, options?: { remote?: string; branch?: string }): Promise<void> => {
    const args = ['fetch'];
    if (options?.remote) args.push(options.remote);
    if (options?.branch) args.push(options.branch);
    await runGit(cwd, args);
  };

  const pull = async (cwd: string, options?: { remote?: string }): Promise<void> => {
    const args = ['pull'];
    if (options?.remote) args.push(options.remote);
    await runGit(cwd, args);
  };

  const push = async (cwd: string, options?: { remote?: string; branch?: string; force?: boolean }): Promise<void> => {
    const args = ['push'];
    if (options?.force) args.push('--force-with-lease');
    if (options?.remote) args.push(options.remote);
    if (options?.branch) args.push(options.branch);
    await runGit(cwd, args);
  };

  const commit = async (cwd: string, message: string, files: string[]): Promise<{ hash: string }> => {
    if (files.length > 0) {
      await runGit(cwd, ['add', '--', ...files]);
    }
    await runGit(cwd, ['commit', '-m', message]);
    const hash = await runGit(cwd, ['rev-parse', 'HEAD']);
    return { hash: hash.slice(0, 12) };
  };

  const getDiffStats = async (cwd: string): Promise<{ staged: GitDiffStat[]; unstaged: GitDiffStat[] }> => {
    const parseDiffStat = (output: string): GitDiffStat[] => {
      return output.split('\n').filter(Boolean).map((line) => {
        const [add, del, ...pathParts] = line.split('\t');
        return {
          path: pathParts.join('\t'),
          additions: add === '-' ? 0 : parseInt(add, 10) || 0,
          deletions: del === '-' ? 0 : parseInt(del, 10) || 0,
        };
      });
    };

    let staged: GitDiffStat[] = [];
    let unstaged: GitDiffStat[] = [];

    try {
      const stagedOutput = await runGit(cwd, ['diff', '--cached', '--numstat']);
      staged = parseDiffStat(stagedOutput);
    } catch { /* empty */ }

    try {
      const unstagedOutput = await runGit(cwd, ['diff', '--numstat']);
      unstaged = parseDiffStat(unstagedOutput);
    } catch { /* empty */ }

    return { staged, unstaged };
  };

  const createBranch = async (cwd: string, branchName: string, fromRef?: string): Promise<void> => {
    const args = ['checkout', '-b', branchName];
    if (fromRef) args.push(fromRef);
    await runGit(cwd, args);
  };

  const checkoutBranch = async (cwd: string, branchName: string): Promise<void> => {
    await runGit(cwd, ['checkout', branchName]);
  };

  const renameBranch = async (cwd: string, oldName: string, newName: string): Promise<void> => {
    await runGit(cwd, ['branch', '-m', oldName, newName]);
  };

  const deleteBranch = async (cwd: string, branchName: string, options?: { force?: boolean }): Promise<void> => {
    const flag = options?.force ? '-D' : '-d';
    await runGit(cwd, ['branch', flag, branchName]);
  };

  const deleteRemoteBranch = async (cwd: string, remoteName: string, branchName: string): Promise<void> => {
    await runGit(cwd, ['push', remoteName, '--delete', branchName]);
  };

  const mergeCmd = async (cwd: string, branchName: string): Promise<void> => {
    await runGit(cwd, ['merge', branchName]);
  };

  const rebaseCmd = async (cwd: string, branchName: string): Promise<void> => {
    await runGit(cwd, ['rebase', branchName]);
  };

  const worktreeList = async (cwd: string): Promise<GitWorktreeEntry[]> => {
    const output = await runGit(cwd, ['worktree', 'list', '--porcelain']);
    const entries: GitWorktreeEntry[] = [];
    const lines = output.split(/\r?\n/);
    let current: Partial<GitWorktreeEntry> | null = null;

    for (const line of lines) {
      if (!line.trim()) {
        if (current?.path) {
          entries.push(current as GitWorktreeEntry);
        }
        current = null;
        continue;
      }

      if (line.startsWith('worktree ')) {
        if (current?.path) entries.push(current as GitWorktreeEntry);
        current = { path: line.slice('worktree '.length).trim() };
      } else if (current) {
        if (line.startsWith('HEAD ')) {
          current.head = line.slice('HEAD '.length).trim();
        } else if (line.startsWith('branch ')) {
          current.branch = parseBranchName(line.slice('branch '.length));
        } else if (line === 'bare') {
          current.bare = true;
        }
      }
    }

    if (current?.path) entries.push(current as GitWorktreeEntry);
    return entries;
  };

  const worktreeAdd = async (
    cwd: string,
    targetPath: string,
    options: { branch?: string; newBranch?: string; startPoint?: string },
  ): Promise<void> => {
    const args = ['worktree', 'add'];
    if (options.newBranch) {
      args.push('-b', options.newBranch);
    } else if (options.branch) {
      args.push('--checkout');
    }
    args.push(targetPath);
    if (options.branch && !options.newBranch) {
      args.push(options.branch);
    }
    if (options.startPoint && options.newBranch) {
      args.push(options.startPoint);
    }
    await runGit(cwd, args);
  };

  const worktreeRemove = async (cwd: string, worktreePath: string): Promise<void> => {
    await runGit(cwd, ['worktree', 'remove', '--force', worktreePath]);
  };

  return {
    isGitRepository,
    getStatus,
    getBranches,
    getRemotes,
    fetch: fetchCmd,
    pull,
    push,
    commit,
    getDiffStats,
    createBranch,
    checkoutBranch,
    renameBranch,
    deleteBranch,
    deleteRemoteBranch,
    merge: mergeCmd,
    rebase: rebaseCmd,
    worktreeList,
    worktreeAdd,
    worktreeRemove,
  };
}
