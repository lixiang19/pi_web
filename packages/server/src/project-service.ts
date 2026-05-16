import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { getRidgeDb } from './db/index.js';
import type { Project } from './types/index.js';

const execFileAsync = promisify(execFile);
const GITHUB_REACHABILITY_TIMEOUT_MS = 5_000;

export interface CreateInternalProjectInput {
  name: string;
  workspacePath: string;
}

export interface RegisterExternalProjectInput {
  path: string;
  externalOrigin: 'folder' | 'github';
  deviceId?: string;
  workspacePath: string;
}

export interface UpdateProjectInput {
  archived?: boolean;
}

// Lazily import desktop-bridge to avoid circular deps at module load time
async function validatePathViaDesktop(
  deviceId: string,
  projectPath: string,
): Promise<{
  exists: boolean;
  isDirectory: boolean;
  isGit: boolean;
}> {
  const { forwardRunRequestToDesktop } = await import("./desktop-bridge.js");
  const result = await forwardRunRequestToDesktop(deviceId, {
    type: "validate_path",
    path: projectPath,
  });
  if (typeof result !== "object" || result === null) {
    throw Object.assign(new Error("Desktop returned invalid path validation"), { statusCode: 502 });
  }
  const r = result as Record<string, unknown>;
  return {
    exists: r.exists === true,
    isDirectory: r.isDirectory === true,
    isGit: r.isGit === true,
  };
}

// Test-only override for desktop path validation
let _validatePathViaDesktopImpl = validatePathViaDesktop;

export function _setValidatePathViaDesktopForTesting(
  impl: typeof validatePathViaDesktop,
): void {
  if (!process.env.VITEST) {
    throw new Error("_setValidatePathViaDesktopForTesting is test-only");
  }
  _validatePathViaDesktopImpl = impl;
}

export function _resetValidatePathViaDesktopTesting(): void {
  _validatePathViaDesktopImpl = validatePathViaDesktop;
}

// Internal project name validation: reject path traversal and control chars
function validateInternalProjectName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw Object.assign(new Error('Project name is required'), { statusCode: 400 });
  }
  // Reject empty/whitespace-only after trim
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw Object.assign(new Error('Project name cannot be empty'), { statusCode: 400 });
  }
  // Reject control characters (0x00-0x1F, 0x7F)
  if (/[\x00-\x1f\x7f]/.test(name)) {
    throw Object.assign(new Error('Project name contains invalid characters'), { statusCode: 400 });
  }
  // Reject path separators and traversal
  if (/[\\\/]/.test(name)) {
    throw Object.assign(new Error('Project name cannot contain path separators'), { statusCode: 400 });
  }
  // Reject . and .. and leading/trailing dots that could cause issues
  if (name === '.' || name === '..' || name.startsWith('..')) {
    throw Object.assign(new Error('Project name cannot be "." or ".."'), { statusCode: 400 });
  }
}

function generateProjectId(): string {
  return crypto.randomUUID();
}

export async function createInternalProject(
  input: CreateInternalProjectInput,
): Promise<Project> {
  validateInternalProjectName(input.name);

  const expectedDir = path.join(input.workspacePath, '项目', input.name);
  await fs.mkdir(expectedDir, { recursive: true });

  // Security: realpath must stay within workspace/项目/
  const realProjectDir = await fs.realpath(expectedDir);
  const realWorkspace = await fs.realpath(input.workspacePath);
  const expectedPrefix = path.join(realWorkspace, '项目') + path.sep;
  if (!realProjectDir.startsWith(expectedPrefix)) {
    // If realpath escaped, clean up and reject
    try {
      await fs.rm(expectedDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Log but don't suppress the real security error
      console.error('Failed to cleanup escaped project dir:', cleanupError);
    }
    throw Object.assign(new Error('Project path escaped workspace boundary'), { statusCode: 400 });
  }

  const now = Date.now();
  const projectId = generateProjectId();
  const db = await getRidgeDb();

  db.prepare(
    `INSERT INTO projects(
      project_id, name, path, is_git, added_at,
      project_type, external_origin, workspace_path, device_id, archived_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    projectId,
    input.name,
    realProjectDir,
    0,
    now,
    'internal',
    null,
    input.workspacePath,
    null,
    null,
    now,
  );

  return {
    id: projectId,
    name: input.name,
    path: realProjectDir,
    addedAt: now,
    isGit: false,
    projectType: 'internal',
    externalOrigin: null,
    isOnline: false,
    updatedAt: now,
  };
}

export async function registerExternalProject(
  input: RegisterExternalProjectInput,
): Promise<Project> {
  const normalizedPath = path.normalize(input.path);

  // 外部仓库必须绑定设备（服务器自身或具体桌面设备）
  const effectiveDeviceId = input.deviceId || 'server';

  const db = await getRidgeDb();

  // If device is not 'server', verify it exists and is a desktop device
  if (effectiveDeviceId !== 'server') {
    const deviceRow = db.prepare(
      'SELECT device_id, device_type FROM devices WHERE device_id = ?'
    ).get(effectiveDeviceId) as { device_id: string; device_type: string } | undefined;

    if (!deviceRow) {
      throw Object.assign(new Error(`Device ${effectiveDeviceId} not found`), { statusCode: 404 });
    }
    if (deviceRow.device_type !== 'desktop') {
      throw Object.assign(
        new Error(`Device ${effectiveDeviceId} is not a desktop device`),
        { statusCode: 400 }
      );
    }
  }

  let desktopValidation: { exists: boolean; isDirectory: boolean; isGit: boolean } | undefined;

  // For server-bound projects, we can fs.stat to validate the path exists
  // For desktop-bound projects, we MUST forward to desktop for real path validation
  if (effectiveDeviceId === 'server') {
    try {
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        throw Object.assign(new Error('Project path must be a directory'), { statusCode: 400 });
      }
    } catch (error) {
      const err = error as { code?: string };
      if (err.code === 'ENOENT') {
        throw Object.assign(new Error('Project path does not exist'), { statusCode: 400 });
      }
      throw error; // Re-throw unexpected errors
    }
  } else {
    // Desktop-bound: ask the desktop to validate the path
    desktopValidation = await _validatePathViaDesktopImpl(effectiveDeviceId, normalizedPath);
    if (!desktopValidation.exists) {
      throw Object.assign(new Error('Desktop reports path does not exist'), { statusCode: 400 });
    }
    if (!desktopValidation.isDirectory) {
      throw Object.assign(new Error('Desktop reports path is not a directory'), { statusCode: 400 });
    }
  }

  const now = Date.now();
  const projectId = generateProjectId();

  // Check for duplicate (same device + same path)
  const existing = db.prepare(
    `SELECT project_id FROM projects
     WHERE path = ? AND COALESCE(device_id, 'server') = ?`
  ).get(normalizedPath, effectiveDeviceId) as { project_id: string } | undefined;

  if (existing) {
    throw Object.assign(new Error('项目已注册：同设备同路径不能重复'), { statusCode: 409 });
  }

  const isGit = effectiveDeviceId === 'server'
    ? await checkIsGitRepo(normalizedPath)
    : desktopValidation!.isGit; // Use desktop-reported Git status for desktop-bound projects

  db.prepare(
    `INSERT INTO projects(
      project_id, name, path, is_git, added_at,
      project_type, external_origin, workspace_path, device_id, archived_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    projectId,
    path.basename(normalizedPath),
    normalizedPath,
    isGit ? 1 : 0,
    now,
    'external',
    input.externalOrigin,
    input.workspacePath,
    effectiveDeviceId,
    null,
    now,
  );

  return {
    id: projectId,
    name: path.basename(normalizedPath),
    path: normalizedPath,
    addedAt: now,
    isGit,
    projectType: 'external',
    externalOrigin: input.externalOrigin,
    deviceId: effectiveDeviceId,
    isOnline: false,
    updatedAt: now,
  };
}

export async function cloneGithubRepo(
  url: string,
  workspacePath: string,
  deviceId?: string,
): Promise<Project> {
  // 0. Reject path traversal sequences in the raw URL before normalization
  const pathPart = url.split('?')[0].split('#')[0];
  if (pathPart.includes('/../') || pathPart.endsWith('/..')) {
    throw Object.assign(new Error('Invalid GitHub URL: path traversal not allowed'), { statusCode: 400 });
  }

  // 1. Validate URL scheme whitelist
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw Object.assign(new Error('Only https:// or http:// GitHub URLs are supported'), { statusCode: 400 });
  }
  
  // 2. Validate URL is from github.com
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw Object.assign(new Error('Invalid GitHub URL format'), { statusCode: 400 });
  }
  if (parsedUrl.hostname !== 'github.com') {
    throw Object.assign(new Error('Only github.com URLs are supported'), { statusCode: 400 });
  }
  
  // 3. Reject URLs containing credentials
  if (parsedUrl.username || parsedUrl.password) {
    throw Object.assign(new Error('GitHub URL cannot contain credentials'), { statusCode: 400, code: 'GITHUB_CREDENTIALS' });
  }
  
  // 4. Strict owner/repo parsing from pathname
  const pathnameParts = parsedUrl.pathname.split('/').filter(Boolean);
  if (pathnameParts.length < 2) {
    throw Object.assign(new Error('Invalid GitHub URL: must contain owner and repo'), { statusCode: 400 });
  }
  const [owner, repoNameWithGit] = pathnameParts;
  const repoName = repoNameWithGit.replace(/\.git$/, '');
  if (!owner || !repoName || owner.includes('..') || repoName.includes('..')) {
    throw Object.assign(new Error('Invalid GitHub owner or repo name'), { statusCode: 400 });
  }
  
  // 5. Extract repo name and determine target directory with boundary check
  const baseDir = path.join(osHomedir(), 'ridge-projects');
  const normalizedBaseDir = path.normalize(baseDir);
  let targetDir = path.join(baseDir, repoName);
  const normalizedTargetDir = path.normalize(targetDir);
  if (!normalizedTargetDir.startsWith(normalizedBaseDir + path.sep)) {
    throw Object.assign(new Error('Invalid clone target directory'), { statusCode: 400 });
  }

  // 6. Handle duplicate names by appending suffix
  let suffix = 1;
  while (await pathExists(targetDir)) {
    targetDir = path.join(baseDir, `${repoName}-${suffix}`);
    const normalizedNewTarget = path.normalize(targetDir);
    if (!normalizedNewTarget.startsWith(normalizedBaseDir + path.sep)) {
      throw Object.assign(new Error('Invalid clone target directory with suffix'), { statusCode: 400 });
    }
    suffix++;
  }

  await assertGithubRepoReachable(url);

  // 7. Clone the repository
  try {
    await fs.mkdir(path.dirname(targetDir), { recursive: true });
    await execFileAsync('git', ['clone', '--depth', '1', url, targetDir], { timeout: 120_000 });
  } catch (error) {
    // Clean up partially cloned directory on failure
    try {
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`[project-service] Failed to clean up failed clone dir ${targetDir}:`, cleanupError);
    }
    
    const stderr = (error as { stderr?: string }).stderr || '';
    const message = (error as Error).message || '';
    
    // Structured error responses for common Git failures
    if (stderr.includes('Authentication failed') || stderr.includes('could not read Username')) {
      throw Object.assign(new Error('GitHub authentication failed: repository may be private or require credentials'), { statusCode: 401, code: 'GITHUB_AUTH' });
    }
    if (stderr.includes('Repository not found') || stderr.includes('does not exist')) {
      throw Object.assign(new Error('GitHub repository not found'), { statusCode: 404, code: 'GITHUB_NOT_FOUND' });
    }
    if (stderr.includes('Could not resolve host') || stderr.includes('unable to access')) {
      throw Object.assign(new Error('GitHub is unreachable: check network connection'), { statusCode: 503, code: 'GITHUB_NETWORK' });
    }
    
    throw Object.assign(new Error(`Git clone failed: ${message}`), { statusCode: 400, code: 'GITHUB_CLONE' });
  }

  // 8. Register the cloned repository
  try {
    return await registerExternalProject({
      path: targetDir,
      externalOrigin: 'github',
      deviceId,
      workspacePath,
    });
  } catch (regError) {
    // Registration failed — clean up cloned directory
    try {
      await fs.rm(targetDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`[project-service] Failed to clean up unregistered clone dir ${targetDir}:`, cleanupError);
    }
    throw regError;
  }
}

async function assertGithubRepoReachable(url: string): Promise<void> {
  try {
    await execFileAsync("git", ["ls-remote", "--exit-code", url, "HEAD"], {
      timeout: GITHUB_REACHABILITY_TIMEOUT_MS,
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr || "";
    const message = (error as Error).message || "";
    const killedByTimeout = /timed out/i.test(message);

    if (stderr.includes("Authentication failed") || stderr.includes("could not read Username")) {
      throw Object.assign(
        new Error("GitHub authentication failed: repository may be private or require credentials"),
        { statusCode: 401, code: "GITHUB_AUTH" },
      );
    }
    if (stderr.includes("Repository not found") || stderr.includes("not found") || stderr.includes("does not exist")) {
      throw Object.assign(new Error("GitHub repository not found"), {
        statusCode: 404,
        code: "GITHUB_NOT_FOUND",
      });
    }
    if (
      killedByTimeout ||
      stderr.includes("Could not resolve host") ||
      stderr.includes("unable to access") ||
      stderr.includes("Failed to connect")
    ) {
      throw Object.assign(new Error("GitHub is unreachable: check network connection"), {
        statusCode: 503,
        code: "GITHUB_NETWORK",
      });
    }

    throw Object.assign(new Error(`GitHub repository check failed: ${message}`), {
      statusCode: 400,
      code: "GITHUB_REACHABILITY",
    });
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<Project | null> {
  const db = await getRidgeDb();
  const now = Date.now();

  if (input.archived !== undefined) {
    db.prepare(
      `UPDATE projects
       SET archived_at = ?, updated_at = ?
       WHERE project_id = ?`
    ).run(input.archived ? now : null, now, projectId);
  }

  const row = db.prepare(
    `SELECT
      p.project_id, p.name, p.path, p.is_git, p.added_at,
      p.project_type, p.external_origin,
      COALESCE(d.name, '') AS device_name,
      COALESCE(d.status, 'offline') AS device_status,
      p.archived_at, p.updated_at
    FROM projects p
    LEFT JOIN devices d ON d.device_id = p.device_id
    WHERE p.project_id = ?`
  ).get(projectId) as {
    project_id: string;
    name: string;
    path: string;
    is_git: number;
    added_at: number;
    project_type: string;
    external_origin: string | null;
    device_name: string;
    device_status: string;
    archived_at: number | null;
    updated_at: number;
  } | undefined;

  if (!row) return null;

  return {
    id: row.project_id,
    name: row.name,
    path: row.path,
    addedAt: row.added_at,
    isGit: Boolean(row.is_git),
    projectType: row.project_type as Project['projectType'],
    externalOrigin: row.external_origin as Project['externalOrigin'],
    deviceName: row.device_name || undefined,
    isOnline: row.device_status === 'online',
    archivedAt: row.archived_at || undefined,
    updatedAt: row.updated_at,
  };
}

export async function deleteProjectRegistration(projectId: string): Promise<{ ok: boolean }> {
  const db = await getRidgeDb();

  // Check if project has sessions
  const sessionCount = db.prepare(
    `SELECT COUNT(*) AS count FROM session_index WHERE project_id = ?`
  ).get(projectId) as { count: number };

  if (sessionCount.count > 0) {
    throw Object.assign(new Error('项目存在会话，不能删除'), { statusCode: 409 });
  }

  db.prepare('DELETE FROM projects WHERE project_id = ?').run(projectId);
  return { ok: true };
}

async function checkIsGitRepo(dir: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

function osHomedir(): string {
  return process.env.HOME || process.env.USERPROFILE || '/tmp';
}
