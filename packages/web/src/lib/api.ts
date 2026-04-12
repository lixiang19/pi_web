import type {
  AgentSummary,
  AskQuestionAnswer,
  PermissionDecisionAction,
  DirectoryBrowseResponse,
  FileTreeResponse,
  ProjectItem,
  ProjectsResponse,
  ProvidersResponse,
  ResourceCatalogResponse,
  SendMessagePayload,
  SessionMutationResponse,
  SessionSnapshot,
  SessionSummary,
  ThinkingLevel,
  SystemInfo,
  WorktreeApiInfo,
  WorktreesResponse,
  ValidateWorktreeRequest,
  ValidateWorktreeResponse,
  CreateWorktreeRequest,
  DeleteWorktreeRequest,
  GitStatusResponse,
  GitBranchesResponse,
  GitRemoteInfo,
  GitRepositoryStatusResponse,
} from "./types";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getSystemInfo() {
  return request<SystemInfo>("/api/system/info");
}

export function getProviders() {
  return request<ProvidersResponse>("/api/providers");
}

export function getSessions() {
  return request<SessionSummary[]>("/api/sessions");
}

export function getAgents(cwd?: string) {
  const params = new URLSearchParams();

  if (cwd) {
    params.set("cwd", cwd);
  }

  return request<AgentSummary[]>(
    `/api/agents${params.size > 0 ? `?${params.toString()}` : ""}`,
  );
}

export function getResources(options?: { cwd?: string; sessionId?: string }) {
  const params = new URLSearchParams();

  if (options?.cwd) {
    params.set("cwd", options.cwd);
  }

  if (options?.sessionId) {
    params.set("sessionId", options.sessionId);
  }

  return request<ResourceCatalogResponse>(
    `/api/resources${params.size > 0 ? `?${params.toString()}` : ""}`,
  );
}

export function getSession(sessionId: string, options?: { limit?: number }) {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  return request<SessionSnapshot>(
    `/api/sessions/${sessionId}${params.size > 0 ? `?${params.toString()}` : ""}`,
  );
}

export function createSession(payload: {
  title?: string;
  cwd?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel | null;
  parentSessionId?: string;
  agent?: string | null;
}) {
  return request<SessionSnapshot>("/api/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSession(
  sessionId: string,
  payload: {
    title?: string;
    model?: string | null;
    thinkingLevel?: ThinkingLevel | null;
    agent?: string | null;
  },
) {
  return request<SessionSnapshot>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function renameSession(sessionId: string, payload: { title: string }) {
  return updateSession(sessionId, payload);
}

export function archiveSession(
  sessionId: string,
  payload: { archived: boolean },
) {
  return request<SessionMutationResponse>(
    `/api/sessions/${sessionId}/archive`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteSession(sessionId: string) {
  return request<SessionMutationResponse>(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export function sendMessage(sessionId: string, payload: SendMessagePayload) {
  return request<{ ok: true }>(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function abortSession(sessionId: string) {
  return request<{ ok: true }>(`/api/sessions/${sessionId}/abort`, {
    method: "POST",
  });
}

export function respondToAsk(
  sessionId: string,
  askId: string,
  payload:
    | { action: "submit"; answers: AskQuestionAnswer[] }
    | { action: "dismiss" },
) {
  return request<{ ok: true }>(`/api/sessions/${sessionId}/asks/${askId}/respond`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function respondToPermissionRequest(
  sessionId: string,
  requestId: string,
  payload: { action: PermissionDecisionAction },
) {
  return request<{ ok: true }>(
    `/api/sessions/${sessionId}/permissions/${requestId}/respond`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function getFileTree(path?: string, root?: string) {
  const params = new URLSearchParams();

  if (path) {
    params.set("path", path);
  }

  if (root) {
    params.set("root", root);
  }

  return request<FileTreeResponse>(
    `/api/files/tree${params.size > 0 ? `?${params.toString()}` : ""}`,
  );
}

export function browseFilesystem(path?: string) {
  const params = new URLSearchParams();

  if (path) {
    params.set("path", path);
  }

  return request<DirectoryBrowseResponse>(
    `/api/filesystem/browse${params.size > 0 ? `?${params.toString()}` : ""}`,
  );
}

export function getProjects() {
  return request<ProjectsResponse>("/api/projects");
}

export function addProject(path: string) {
  return request<ProjectItem>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function deleteProject(id: string) {
  return request<{ ok: true }>(`/api/projects/${id}`, {
    method: "DELETE",
  });
}

// ============================================================================
// Worktree API
// ============================================================================

export function getProjectWorktrees(projectId: string) {
  return request<WorktreesResponse>(`/api/projects/${projectId}/worktrees`);
}

export function validateWorktree(
  projectId: string,
  payload: ValidateWorktreeRequest,
) {
  return request<ValidateWorktreeResponse>(
    `/api/projects/${projectId}/worktrees/validate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function createWorktree(
  projectId: string,
  payload: CreateWorktreeRequest,
) {
  return request<WorktreeApiInfo>(
    `/api/projects/${projectId}/worktrees`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteWorktree(
  projectId: string,
  payload: DeleteWorktreeRequest,
) {
  return request<{ ok: true; deletedBranch?: string }>(
    `/api/projects/${projectId}/worktrees`,
    {
      method: "DELETE",
      body: JSON.stringify(payload),
    },
  );
}

// ============================================================================
// Git API
// ============================================================================

export function getGitRepositoryStatus(cwd: string) {
  return request<GitRepositoryStatusResponse>(
    `/api/git/is-repo?cwd=${encodeURIComponent(cwd)}`,
  );
}
export function getGitStatus(cwd: string) {
  return request<GitStatusResponse>(
    `/api/git/status?cwd=${encodeURIComponent(cwd)}`,
  );
}

export function getGitBranches(cwd: string) {
  return request<GitBranchesResponse>(
    `/api/git/branches?cwd=${encodeURIComponent(cwd)}`,
  );
}

export function getGitRemotes(cwd: string) {
  return request<GitRemoteInfo[]>(
    `/api/git/remotes?cwd=${encodeURIComponent(cwd)}`,
  );
}

export function gitFetch(payload: { cwd: string; remote?: string; branch?: string }) {
  return request<{ ok: true }>("/api/git/fetch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitPull(payload: { cwd: string; remote?: string }) {
  return request<{ ok: true }>("/api/git/pull", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitPush(payload: { cwd: string; remote?: string; branch?: string; force?: boolean }) {
  return request<{ ok: true }>("/api/git/push", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitCommit(payload: { cwd: string; message: string; files: string[] }) {
  return request<{ ok: true; hash?: string }>("/api/git/commit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitCreateBranch(payload: { cwd: string; branchName: string; fromRef?: string }) {
  return request<{ ok: true }>("/api/git/create-branch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitCheckout(payload: { cwd: string; branchName: string }) {
  return request<{ ok: true }>("/api/git/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitRenameBranch(payload: { cwd: string; oldName: string; newName: string }) {
  return request<{ ok: true }>("/api/git/rename-branch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitMerge(payload: { cwd: string; branchName: string }) {
  return request<{ ok: true }>("/api/git/merge", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function gitRebase(payload: { cwd: string; branchName: string }) {
  return request<{ ok: true }>("/api/git/rebase", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
