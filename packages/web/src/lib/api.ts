import type {
	AgentSummary,
	AskQuestionAnswer,
	AutomationRule,
	AutomationRuleInput,
	AutomationRunNowResponse,
	AutomationsResponse,
	CreateWorktreeRequest,
	DeleteWorktreeRequest,
	DirectoryBrowseResponse,
	FileEntryCreateRequest,
	FileEntryMoveRequest,
	FileEntryMutationResponse,
	FileEntryTrashResponse,
	FilePreviewPayload,
	FilePreviewWindowPayload,
	FileSaveRequest,
	FileSaveResponse,
	FileTreeEntry,
	FileTreeResponse,
	FileUploadResponse,
	GitBranchesResponse,
	GitRemoteInfo,
	GitRepositoryStatusResponse,
	GitStatusResponse,
	NoteContentResponse,
	NoteCreateFolderResponse,
	NoteCreateResponse,
	NoteListResponse,
	NoteRenameResponse,
	NoteSaveResponse,
	PermissionDecisionAction,
	ProjectItem,
	ProjectsResponse,
	ProvidersResponse,
	ResourceCatalogResponse,
	SessionAttachmentsResponse,
	SendMessagePayload,
	SessionContextSummary,
	SessionHydratePayload,
	SessionMessagesPayload,
	SessionMutationResponse,
	SessionRuntimePayload,
	SessionSnapshot,
	SessionSummary,
	SpacePreviewHtmlResponse,
	SpaceWorksResponse,
	SystemInfo,
	TerminalCreateRequest,
	TerminalListResponse,
	TerminalMutationResponse,
	TerminalRestartRequest,
	TerminalSnapshot,
	TerminalUpdateRequest,
	ThinkingLevel,
	ValidateWorktreeRequest,
	ValidateWorktreeResponse,
	WorktreeApiInfo,
	WorktreesResponse,
	WorkspaceKnowledgeDiagnosticsResponse,
	WorkspaceSearchResponse,
} from "./types";

export class UnauthorizedError extends Error {
	constructor(message = "Unauthorized") {
		super(message);
		this.name = "UnauthorizedError";
	}
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
	unauthorizedHandler = handler;
}

async function request<T>(
	input: RequestInfo,
	init?: RequestInit,
	options: { handleUnauthorized?: boolean } = {},
): Promise<T> {
	const isFormData = init?.body instanceof FormData;
	const response = await fetch(input, {
		headers: {
			...(isFormData ? {} : { "Content-Type": "application/json" }),
			...(init?.headers ?? {}),
		},
		credentials: "same-origin",
		...init,
	});

	if (!response.ok) {
		const text = await response.text();
		if (response.status === 401) {
			if (options.handleUnauthorized !== false) {
				unauthorizedHandler?.();
			}
			throw new UnauthorizedError(text || "Unauthorized");
		}
		throw new Error(text || `Request failed with status ${response.status}`);
	}

	return response.json() as Promise<T>;
}

export function getAuthSession() {
	return request<{ authenticated: boolean }>(
		"/api/auth/session",
		undefined,
		{ handleUnauthorized: false },
	);
}

export function login(password: string) {
	return request<{ ok: true }>(
		"/api/auth/login",
		{
			method: "POST",
			body: JSON.stringify({ password }),
		},
		{ handleUnauthorized: false },
	);
}

export function logout() {
	return request<{ ok: true }>(
		"/api/auth/logout",
		{ method: "POST" },
		{ handleUnauthorized: false },
	);
}

export function getSystemInfo() {
	return request<SystemInfo>("/api/system/info");
}

export interface WorkspaceRestoreResponse {
	ok: true;
	preRestoreSnapshotPath: string;
	restoredFiles: string[];
	rebuildStatus: Record<"rag" | "search_chunks", "pending">;
}

export async function downloadWorkspaceBackup(): Promise<{
	blob: Blob;
	fileName: string;
}> {
	const response = await fetch("/api/workspace/backup", {
		credentials: "same-origin",
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `Request failed with status ${response.status}`);
	}
	const disposition = response.headers.get("content-disposition") ?? "";
	const fileNameMatch = /filename="([^"]+)"/.exec(disposition);
	return {
		blob: await response.blob(),
		fileName: fileNameMatch?.[1] ?? "ridge-backup.zip",
	};
}

export function restoreWorkspaceBackup(file: File): Promise<WorkspaceRestoreResponse> {
	return request<WorkspaceRestoreResponse>("/api/workspace/restore", {
		method: "POST",
		headers: { "Content-Type": file.type || "application/zip" },
		body: file,
	});
}

export function getProviders() {
	return request<ProvidersResponse>("/api/providers");
}

export function getSessions() {
	return request<SessionSummary[]>("/api/sessions");
}

export function getSessionContexts() {
	return request<Record<string, SessionContextSummary>>(
		"/api/session-contexts",
	);
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

export function getAutomations() {
	return request<AutomationsResponse>("/api/automations");
}

export function createAutomation(payload: AutomationRuleInput) {
	return request<AutomationRule>("/api/automations", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function updateAutomation(
	automationId: string,
	payload: Partial<AutomationRuleInput>,
) {
	return request<AutomationRule>(`/api/automations/${automationId}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
}

export function toggleAutomation(automationId: string, enabled: boolean) {
	return request<AutomationRule>(`/api/automations/${automationId}/toggle`, {
		method: "POST",
		body: JSON.stringify({ enabled }),
	});
}

export function runAutomationNow(automationId: string) {
	return request<AutomationRunNowResponse>(
		`/api/automations/${automationId}/run`,
		{ method: "POST" },
	);
}

export function deleteAutomation(automationId: string) {
	return request<{ ok: true }>(`/api/automations/${automationId}`, {
		method: "DELETE",
	});
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

export function getSessionMessages(
	sessionId: string,
	options?: { rounds?: number },
) {
	const params = new URLSearchParams();
	if (options?.rounds) {
		params.set("rounds", String(options.rounds));
	}
	return request<SessionMessagesPayload>(
		`/api/sessions/${sessionId}/messages${params.size > 0 ? `?${params.toString()}` : ""}`,
	);
}

export function getSessionRuntime(sessionId: string) {
	return request<SessionRuntimePayload>(`/api/sessions/${sessionId}/runtime`);
}

export function getSessionHydrate(
	sessionId: string,
	options?: { rounds?: number },
) {
	const params = new URLSearchParams();
	if (options?.rounds) {
		params.set("rounds", String(options.rounds));
	}
	return request<SessionHydratePayload>(
		`/api/sessions/${sessionId}/hydrate${params.size > 0 ? `?${params.toString()}` : ""}`,
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

export function endSession(sessionId: string) {
	return request<{ ok: true; jobId: string }>(`/api/sessions/${sessionId}/end`, {
		method: "POST",
	});
}

export function sendMessage(sessionId: string, payload: SendMessagePayload) {
	return request<{ ok: true }>(`/api/sessions/${sessionId}/messages`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function uploadSessionAttachments(sessionId: string, files: File[]) {
	const formData = new FormData();
	for (const file of files) {
		formData.append("files", file, file.name);
	}
	return request<SessionAttachmentsResponse>(`/api/sessions/${sessionId}/attachments`, {
		method: "POST",
		body: formData,
	});
}

export function getSessionAttachments(sessionId: string) {
	return request<SessionAttachmentsResponse>(`/api/sessions/${sessionId}/attachments`);
}

export function abortSession(sessionId: string) {
	return request<{ ok: true }>(`/api/sessions/${sessionId}/cancel`, {
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
	return request<{ ok: true }>(
		`/api/sessions/${sessionId}/ask/${askId}`,
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
}

export function respondToPermissionRequest(
	sessionId: string,
	requestId: string,
	payload: { action: PermissionDecisionAction },
) {
	return request<{ ok: true }>(
		`/api/sessions/${sessionId}/permissions/${requestId}`,
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

export function searchFiles(root: string, query: string, limit = 50) {
	const params = new URLSearchParams({ root, q: query, limit: String(limit) });
	return request<{ entries: FileTreeEntry[] }>(
		`/api/files/search?${params.toString()}`,
	);
}

export function createFileEntry(payload: FileEntryCreateRequest) {
	return request<FileEntryMutationResponse>("/api/files/entries", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function moveFileEntry(payload: FileEntryMoveRequest) {
	return request<FileEntryMutationResponse>("/api/files/entries/path", {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
}

export function trashFileEntry(root: string, path: string) {
	const params = new URLSearchParams({ root, path });
	return request<FileEntryTrashResponse>(
		`/api/files/entries?${params.toString()}`,
		{
			method: "DELETE",
		},
	);
}

export function uploadFiles(root: string, directory: string, files: File[]) {
	const formData = new FormData();
	formData.set("root", root);
	formData.set("directory", directory);

	for (const file of files) {
		formData.append("files", file, file.name);
	}

	return request<FileUploadResponse>("/api/files/upload", {
		method: "POST",
		body: formData,
	});
}

export function getFilePreview(path: string, root: string) {
	const params = new URLSearchParams({ path, root });
	return request<FilePreviewPayload>(`/api/files/content?${params.toString()}`);
}

export function getWorkspaceFilesTree(path?: string) {
	const params = new URLSearchParams();
	if (path) {
		params.set("path", path);
	}
	return request<FileTreeResponse>(
		`/api/workspace/files/tree${params.size > 0 ? `?${params.toString()}` : ""}`,
	);
}

export function getWorkspaceFilesRead(path: string) {
	const params = new URLSearchParams();
	if (path) {
		params.set("path", path);
	}
	return request<FilePreviewPayload>(`/api/workspace/files/read?${params.toString()}`);
}

export function getWorkspaceSpaceWorks() {
	return request<SpaceWorksResponse>("/api/workspace/space");
}

export function getWorkspaceSpacePreviewHtml(id: string) {
	return request<SpacePreviewHtmlResponse>(
		`/api/workspace/space/${encodeURIComponent(id)}/preview-html`,
	);
}

export function searchWorkspace(options: {
	q: string;
	type?: string;
	project?: string;
	time?: string;
	dir?: string;
	limit?: number;
	sort?: string;
}) {
	const params = new URLSearchParams({ q: options.q });
	if (options.type) params.set("type", options.type);
	if (options.project) params.set("project", options.project);
	if (options.time) params.set("time", options.time);
	if (options.dir) params.set("dir", options.dir);
	if (options.limit) params.set("limit", String(options.limit));
	if (options.sort) params.set("sort", options.sort);
	return request<WorkspaceSearchResponse>(`/api/workspace/search?${params.toString()}`);
}

export function getWorkspaceKnowledgeDiagnostics() {
	return request<WorkspaceKnowledgeDiagnosticsResponse>("/api/workspace/knowledge/diagnostics");
}

export function refreshWorkspaceRag(path: string) {
	return request<{ success: boolean; indexed: boolean; error?: string; skipped?: boolean }>(
		"/api/workspace/rag/refresh",
		{
			method: "POST",
			body: JSON.stringify({ path }),
		},
	);
}

export function updateFileProcessingStatus(path: string, status: string, error?: string) {
	return request<{ ok: true }>("/api/workspace/files/status", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path, status, error }),
	});
}

export function retryFileProcessing(path: string) {
	return request<{ ok: true }>("/api/workspace/files/retry", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path }),
	});
}

export function convertFile(path: string, force = false) {
	return request<{ ok: true }>("/api/workspace/files/convert", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path, force }),
	});
}

export function getFilePreviewWindow(
	path: string,
	root: string,
	startLine: number,
	lineCount: number,
) {
	const params = new URLSearchParams({
		path,
		root,
		startLine: String(startLine),
		lineCount: String(lineCount),
	});

	return request<FilePreviewWindowPayload>(
		`/api/files/content-window?${params.toString()}`,
	);
}

export function saveFileContent(payload: FileSaveRequest) {
	return request<FileSaveResponse>("/api/files/content", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export function getFileBlobUrl(path: string, root: string) {
	const params = new URLSearchParams({ path, root });
	return `/api/files/blob?${params.toString()}`;
}

export function openFileWithDefaultApp(root: string, path: string) {
	return request<{ ok: true }>("/api/files/open", {
		method: "POST",
		body: JSON.stringify({ root, path }),
	});
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

export function getDevices() {
	return request<import("@pi/protocol").DevicesResponse>('/api/devices');
}

export function registerDevice(params: {
	deviceId: string;
	name: string;
	deviceType: 'server' | 'desktop';
	capabilities?: Record<string, boolean>;
}) {
	return request<{
		deviceId: string;
		name: string;
		deviceType: string;
		status: string;
		capabilities: Record<string, boolean>;
		token: string;
	}>('/api/devices/register', {
		method: 'POST',
		body: JSON.stringify(params),
	});
}

export function heartbeatDevice(deviceId: string, token: string) {
	return request<{ ok: true }>('/api/devices/heartbeat', {
		method: 'POST',
		body: JSON.stringify({ deviceId, token }),
	});
}

export function renameDevice(deviceId: string, name: string, token: string) {
	return request<{ ok: true }>(`/api/devices/${deviceId}/rename`, {
		method: 'POST',
		body: JSON.stringify({ name, token }),
	});
}

export function getDeviceBundle(deviceId: string, token: string) {
	return request<{
		manifest: {
			bundleId: string;
			deviceId: string;
			version: number;
			agents: Array<{ name: string; path: string }>;
			skills: Array<{ name: string; path: string }>;
			startupContext: { memory?: string; wikiIndex?: string };
		};
		files: Record<string, string>;
	}>(`/api/devices/${deviceId}/bundle?token=${encodeURIComponent(token)}`);
}

export function ackDeviceBundle(deviceId: string, bundleId: string, token: string) {
	return request<{ ok: true; bundleId: string; ackedAt: number }>(`/api/devices/${deviceId}/bundle/ack`, {
		method: 'POST',
		body: JSON.stringify({ bundleId, token }),
	});
}

export function addProject(path: string) {
	return request<ProjectItem>("/api/projects", {
		method: "POST",
		body: JSON.stringify({ path }),
	});
}

export function createInternalProject(name: string) {
	return request<ProjectItem>("/api/workspace/projects/internal", {
		method: "POST",
		body: JSON.stringify({ name }),
	});
}

export function registerExternalProject(projectPath: string, deviceId?: string) {
	return request<ProjectItem>("/api/workspace/projects/external", {
		method: "POST",
		body: JSON.stringify({ path: projectPath, deviceId }),
	});
}

export function cloneGithubProject(url: string, deviceId?: string) {
	return request<ProjectItem>("/api/workspace/projects/github", {
		method: "POST",
		body: JSON.stringify({ url, deviceId }),
	});
}

export function archiveProject(id: string, archived: boolean) {
	return request<ProjectItem>(`/api/workspace/projects/${id}`, {
		method: "PATCH",
		body: JSON.stringify({ archived }),
	});
}

export function deleteProjectRegistration(id: string) {
	return request<{ ok: true }>(`/api/workspace/projects/${id}`, {
		method: "DELETE",
	});
}

export function deleteProject(id: string) {
	return request<{ ok: true }>(`/api/projects/${id}`, {
		method: "DELETE",
	});
}

export function getTerminals() {
	return request<TerminalListResponse>("/api/terminals");
}

export function createTerminal(payload: TerminalCreateRequest = {}) {
	return request<TerminalSnapshot>("/api/terminals", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function updateTerminal(
	terminalId: string,
	payload: TerminalUpdateRequest,
) {
	return request<TerminalSnapshot>(`/api/terminals/${terminalId}`, {
		method: "PATCH",
		body: JSON.stringify(payload),
	});
}

export function restartTerminal(
	terminalId: string,
	payload: TerminalRestartRequest,
) {
	return request<TerminalSnapshot>(`/api/terminals/${terminalId}/restart`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function deleteTerminal(terminalId: string) {
	return request<TerminalMutationResponse>(`/api/terminals/${terminalId}`, {
		method: "DELETE",
	});
}

export function getTerminalStreamUrl(terminalId: string) {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}/api/terminals/${encodeURIComponent(terminalId)}/stream`;
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
	return request<WorktreeApiInfo>(`/api/projects/${projectId}/worktrees`, {
		method: "POST",
		body: JSON.stringify(payload),
	});
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

export function gitFetch(payload: {
	cwd: string;
	remote?: string;
	branch?: string;
}) {
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

export function gitPush(payload: {
	cwd: string;
	remote?: string;
	branch?: string;
	force?: boolean;
}) {
	return request<{ ok: true }>("/api/git/push", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function gitCommit(payload: {
	cwd: string;
	message: string;
	files: string[];
}) {
	return request<{ ok: true; hash?: string }>("/api/git/commit", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function gitCreateBranch(payload: {
	cwd: string;
	branchName: string;
	fromRef?: string;
}) {
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

export function gitShowDiff(payload: {
	cwd: string;
	filePath: string;
	staged?: boolean;
}) {
	const params = new URLSearchParams();
	params.set("cwd", payload.cwd);
	params.set("filePath", payload.filePath);
	if (payload.staged) params.set("staged", "true");
	return request<import("./types").GitDiffResponse>(
		`/api/git/diff?${params.toString()}`,
	);
}

export function getWorkspaceVersionStatus(root: string) {
	return request<GitStatusResponse>(
		`/api/workspace/version/status?root=${encodeURIComponent(root)}`,
	);
}

export function workspaceVersionCommit(payload: {
	root: string;
	message: string;
	files: string[];
}) {
	return request<{ ok: true; hash: string | null; files: string[] }>(
		"/api/workspace/version/commit",
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);
}

export function workspaceVersionShowDiff(payload: {
	root: string;
	filePath: string;
}) {
	const params = new URLSearchParams();
	params.set("root", payload.root);
	params.set("filePath", payload.filePath);
	return request<import("./types").GitDiffResponse>(
		`/api/workspace/version/diff?${params.toString()}`,
	);
}

export function gitRenameBranch(payload: {
	cwd: string;
	oldName: string;
	newName: string;
}) {
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

// ============================================================================
// Notes API
// ============================================================================

export function listNotes() {
	return request<NoteListResponse>("/api/notes");
}

export function getNoteContent(path: string) {
	return request<NoteContentResponse>(
		`/api/notes/content?path=${encodeURIComponent(path)}`,
	);
}

export function saveNoteContent(path: string, content: string) {
	return request<NoteSaveResponse>("/api/notes/content", {
		method: "PUT",
		body: JSON.stringify({ path, content }),
	});
}

export function createNote(data: {
	name?: string;
	path?: string;
	content?: string;
}) {
	return request<NoteCreateResponse>("/api/notes", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

export function renameNote(path: string, newName: string) {
	return request<NoteRenameResponse>("/api/notes/rename", {
		method: "PATCH",
		body: JSON.stringify({ path, newName }),
	});
}

export function deleteNote(path: string) {
	return request<{ deleted: boolean }>(
		`/api/notes?path=${encodeURIComponent(path)}`,
		{ method: "DELETE" },
	);
}

export function createNoteFolder(folderPath?: string) {
	return request<NoteCreateFolderResponse>("/api/notes/folder", {
		method: "POST",
		body: JSON.stringify({ path: folderPath }),
	});
}

export function createFile(relPath: string, content = "") {
	return request<NoteCreateResponse>("/api/files/create", {
		method: "POST",
		body: JSON.stringify({ path: relPath, content }),
	});
}

export interface RecentFileItem {
	name: string;
	path: string;
	relativePath: string;
	modifiedAt: number;
	extension: string;
	size: number | null;
}

export function getRecentFiles(root: string, limit = 20) {
	const params = new URLSearchParams({ root, limit: String(limit) });
	return request<{ files: RecentFileItem[] }>(
		`/api/workspace/recent-files?${params.toString()}`,
	);
}

// Fleeting Notes API
export type FleetingRecommendationType = "journal" | "clip" | "task" | "delete";

export interface FleetingNote {
	id: string;
	content: string;
	status: "pending" | "processing" | "processed";
	analysisStatus: "unanalyzed" | "analyzing" | "suggested" | "failed";
	recommendationType: FleetingRecommendationType | null;
	recommendationText: string | null;
	draft: string | null;
	requiresInput: boolean;
	lastError?: string | null;
	retryCount?: number;
	piSessionId: string | null;
	piSessionFile: string | null;
	captureType?: string;
	metadata?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
}

export interface FleetingAttachment {
	id: string;
	noteId: string;
	originalName: string;
	storedName: string;
	mimeType: string;
	size: number;
	sha256: string;
	createdAt: number;
}

export interface ClipRecord {
	id: string;
	title: string;
	url: string | null;
	content: string;
	source: string | null;
	createdAt: number;
	updatedAt: number;
}

export function getFleetingNotes() {
	return request<{ notes: FleetingNote[] }>("/api/fleeting");
}

export function createFleetingNote(content: string, delayAnalysis?: boolean) {
	return request<{ note: FleetingNote }>("/api/fleeting", {
		method: "POST",
		body: JSON.stringify({ content, delayAnalysis }),
	});
}

export type DesktopCaptureType =
	| "text"
	| "screenshot_region"
	| "screenshot_window"
	| "screenshot_fullscreen"
	| "file"
	| "clipboard"
	| "selection"
	| "browser_url"
	| "audio";

export interface DesktopCapturePayload {
	content: string;
	type: DesktopCaptureType;
	metadata?: Record<string, unknown>;
	attachments?: { name: string; mimeType: string; base64: string }[];
	delayAnalysis?: boolean;
}

export function captureFromDesktop(payload: DesktopCapturePayload) {
	return request<{
		note: FleetingNote & { captureType: string; metadata: Record<string, unknown> };
		attachments: FleetingAttachment[];
	}>("/api/fleeting/capture", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export function uploadFleetingAttachments(noteId: string, files: File[]) {
	const formData = new FormData();
	for (const file of files) {
		formData.append("files", file);
	}
	return request<{ attachments: FleetingAttachment[] }>(`/api/fleeting/${noteId}/attachments`, {
		method: "POST",
		body: formData,
	});
}

export async function captureFleetingWithFiles(
	content: string,
	type: Extract<DesktopCaptureType, "file" | "audio">,
	files: File[],
	metadata?: Record<string, unknown>,
) {
	const created = await captureFromDesktop({
		content,
		type,
		metadata,
		attachments: [],
		delayAnalysis: true,
	});
	const uploaded = files.length > 0
		? await uploadFleetingAttachments(String(created.note.id), files)
		: { attachments: [] as FleetingAttachment[] };
	await triggerFleetingAnalysis(String(created.note.id));
	return {
		note: created.note,
		attachments: uploaded.attachments,
	};
}

export function getFleetingAttachments(noteId: string) {
	return request<{ attachments: FleetingAttachment[] }>(`/api/fleeting/${noteId}/attachments`);
}

export function deleteFleetingNote(noteId: string) {
	return request<{ deleted: true }>(`/api/fleeting/${noteId}`, {
		method: "DELETE",
	});
}

export function processFleetingToJournal(noteId: string, content: string) {
	return request<{ processed: true; note: FleetingNote; journalPath: string; migratedAttachments?: string[]; failedAttachments?: string[] }>(
		`/api/fleeting/${noteId}/process/journal`,
		{
			method: "POST",
			body: JSON.stringify({ content }),
		},
	);
}

export function processFleetingToClip(
	noteId: string,
	data: { title: string; url?: string; content: string; source?: string },
) {
	return request<{ processed: true; note: FleetingNote; clip: ClipRecord; migratedAttachments?: string[]; failedAttachments?: string[] }>(
		`/api/fleeting/${noteId}/process/clip`,
		{
			method: "POST",
			body: JSON.stringify(data),
		},
	);
}

export function processFleetingToTask(
	noteId: string,
	data: { title: string; priority: WorkspaceTaskPriority; acceptanceCriteria: string; dueDate?: number | null; projectId?: string | null },
) {
	return request<{ processed: true; note: FleetingNote; task: WorkspaceTask; migratedAttachments?: string[]; failedAttachments?: string[] }>(
		`/api/fleeting/${noteId}/process/task`,
		{
			method: "POST",
			body: JSON.stringify(data),
		},
	);
}

export function processFleetingToMilestone(
	noteId: string,
	data: { title: string; goal: string; acceptanceCriteria: string; dueDate?: number | null; color?: string; projectId?: string | null },
) {
	return request<{ processed: true; note: FleetingNote; milestone: WorkspaceMilestone; migratedAttachments?: string[]; failedAttachments?: string[] }>(
		`/api/fleeting/${noteId}/process/milestone`,
		{
			method: "POST",
			body: JSON.stringify(data),
		},
	);
}

export function processFleetingToAttachment(noteId: string) {
	return request<{ processed: true; note: FleetingNote; migratedAttachments?: string[]; failedAttachments?: string[] }>(
		`/api/fleeting/${noteId}/process/attachment`,
		{ method: "POST" },
	);
}

export function triggerFleetingAnalysis(noteId: string) {
	return request<{ triggered: true; note: FleetingNote }>(`/api/fleeting/${noteId}/analyze`, {
		method: "POST",
	});
}

export function getFleetingAnalysis(noteId: string) {
	return request<{
		analysisStatus: string;
		recommendationType: string | null;
		recommendationText: string | null;
		draft: string | null;
		requiresInput: boolean;
		lastError: string | null;
		retryCount: number;
		updatedAt: number;
	}>(`/api/fleeting/${noteId}/analysis`);
}

export function getFleetingSuggestions(status?: "unanalyzed" | "analyzing" | "suggested" | "failed") {
	const params = new URLSearchParams();
	if (status) params.set("status", status);
	return request<{ notes: FleetingNote[] }>(`/api/fleeting/suggestions${params.size > 0 ? `?${params.toString()}` : ""}`);
}

export function getClips() {
	return request<{ clips: ClipRecord[] }>("/api/fleeting/clips");
}

// Workspace Tasks API
export type WorkspaceTaskStatus =
	| "pending"
	| "in_progress"
	| "blocked"
	| "reviewing"
	| "completed";

export type WorkspaceTaskPriority =
	| "normal"
	| "important"
	| "urgent";

export interface WorkspaceTask {
	id: string;
	workspacePath: string;
	projectId: string | null;
	milestoneId: string;
	title: string;
	status: WorkspaceTaskStatus;
	priority: WorkspaceTaskPriority;
	acceptanceCriteria: string;
	dueDate: number | null;
	blockedReason: string | null;
	processingSessionId: string | null;
	sortOrder: number;
	order?: number;
	tags?: string[];
	createdAt: number;
	updatedAt: number;
	kind?: "goal" | "task";
	sessionId?: string;
	source?: "dashboard";
}

export interface WorkspaceMilestone {
	id: string;
	workspacePath: string;
	projectId: string | null;
	title: string;
	goal: string;
	acceptanceCriteria: string;
	status: WorkspaceTaskStatus;
	dueDate: number | null;
	isSystem: boolean;
	color: string;
	sortOrder: number;
	createdAt: number;
	updatedAt: number;
	taskCount: number;
}

export interface TasksListResponse {
	tasks: WorkspaceTask[];
}

export interface MilestonesListResponse {
	milestones: WorkspaceMilestone[];
}

export function getWorkspaceTasks(projectId?: string | null) {
	let url = "/api/workspace/tasks";
	if (projectId !== undefined) {
		url += `?projectId=${projectId === null ? "none" : encodeURIComponent(projectId)}`;
	}
	return request<TasksListResponse>(url);
}

export function createWorkspaceTask(data: {
	title: string;
	priority: WorkspaceTaskPriority;
	acceptanceCriteria: string;
	dueDate?: number | null;
	milestoneId?: string | null;
	projectId?: string | null;
	kind?: "goal" | "task";
	sessionId?: string;
	source?: "dashboard";
}) {
	return request<{ task: WorkspaceTask }>("/api/workspace/tasks", {
		method: "POST",
		body: JSON.stringify(data),
	});
}

export function updateWorkspaceTask(
	taskId: string,
	data: {
		status?: WorkspaceTaskStatus;
		title?: string;
		priority?: WorkspaceTaskPriority;
		acceptanceCriteria?: string;
		dueDate?: number | null;
		milestoneId?: string;
		projectId?: string | null;
		blockedReason?: string | null;
		sortOrder?: number;
		actor?: "user" | "agent";
		kind?: "goal" | "task";
		sessionId?: string;
		source?: "dashboard";
	},
) {
	return request<{ task: WorkspaceTask }>(`/api/workspace/tasks/${taskId}`, {
		method: "PATCH",
		body: JSON.stringify(data),
	});
}

export function getTaskProcessingSession(taskId: string) {
	return request<{ sessionId: string }>(
		`/api/workspace/tasks/${taskId}/processing-session`,
	);
}

export function startTaskProcessingSession(taskId: string) {
	return request<{ sessionId: string; created: boolean; snapshot?: SessionSnapshot }>(
		`/api/workspace/tasks/${taskId}/processing-session`,
		{ method: "POST" },
	);
}

export function deleteWorkspaceTask(taskId: string) {
	return request<{ ok: true }>(`/api/workspace/tasks/${taskId}`, {
		method: "DELETE",
	});
}

export function requestTaskReview() {
	return request<{ job: { jobId: string; type: string; status: string } }>("/api/workspace/tasks/review", {
		method: "POST",
	});
}

export function getWorkspaceMilestones() {
	return request<MilestonesListResponse>("/api/workspace/milestones");
}

export function createWorkspaceMilestone(data: {
	title: string;
	goal: string;
	acceptanceCriteria: string;
	dueDate?: number | null;
	color?: string;
	projectId?: string | null;
}) {
	return request<{ milestone: WorkspaceMilestone }>(
		"/api/workspace/milestones",
		{
			method: "POST",
			body: JSON.stringify(data),
		},
	);
}

export function updateWorkspaceMilestone(
	milestoneId: string,
	data: {
		title?: string;
		goal?: string;
		acceptanceCriteria?: string;
		status?: WorkspaceTaskStatus;
		dueDate?: number | null;
		color?: string;
		projectId?: string | null;
		actor?: "user" | "agent";
	},
) {
	return request<{ milestone: WorkspaceMilestone }>(
		`/api/workspace/milestones/${milestoneId}`,
		{
			method: "PATCH",
			body: JSON.stringify(data),
		},
	);
}

export function deleteWorkspaceMilestone(milestoneId: string) {
	return request<{ ok: true }>(
		`/api/workspace/milestones/${milestoneId}`,
		{ method: "DELETE" },
	);
}

// Notifications API
export type NotificationFilter =
	| "unhandled"
	| "all"
	| "failed"
	| "suggestions"
	| "handled";

export type NotificationType =
	| "suggestion"
	| "confirmation"
	| "failure"
	| "warning"
	| "info";

export type NotificationSeverity = "info" | "warning" | "error";
export type NotificationStatus = "unread" | "pending" | "handled" | "dismissed" | "failed";

export interface NotificationAction {
	id: string;
	label: string;
	kind:
		| "view"
		| "dismiss"
		| "retry"
		| "accept_suggestion"
		| "reject_suggestion"
		| "open_related"
		| "mark_handled";
}

export interface NotificationEvent {
	id: string;
	eventType: string;
	type: NotificationType;
	source: string;
	severity: NotificationSeverity;
	status: NotificationStatus;
	title: string;
	body: string;
	payload: Record<string, unknown>;
	related: { type: string; id: string } | null;
	actions: NotificationAction[];
	createdAt: number;
	updatedAt: number;
	handledAt: number | null;
}

export interface NotificationsResponse {
	notifications: NotificationEvent[];
	counts: Record<NotificationFilter, number>;
}

export function getNotifications(filter: NotificationFilter = "unhandled") {
	return request<NotificationsResponse>(`/api/notifications?filter=${filter}`);
}

export function performNotificationAction(eventId: string, actionId: string) {
	return request<{ notification: NotificationEvent }>(`/api/notifications/${eventId}/actions`, {
		method: "POST",
		body: JSON.stringify({ actionId }),
	});
}

// Journal API
export function getJournalMonths(root: string, year: number) {
	const params = new URLSearchParams({ root, year: String(year) });
	return request<{ months: number[] }>(
		`/api/workspace/journal?${params.toString()}`,
	);
}

export function getJournalEntries(root: string, year: number, month: number) {
	const params = new URLSearchParams({
		root,
		year: String(year),
		month: String(month),
	});
	return request<{ entries: string[] }>(
		`/api/workspace/journal?${params.toString()}`,
	);
}

// Bases API
export interface BaseColumn {
	id: string;
	name: string;
	type:
		| "text"
		| "number"
		| "date"
		| "select"
		| "multiselect"
		| "checkbox"
		| "file";
	options?: string[];
}

export interface BaseRow {
	id: string;
	type: "independent" | "file";
	path?: string;
	cells: Record<string, unknown>;
	fileTitle?: string;
}

export interface BaseView {
	id: string;
	name: string;
	type: "table" | "kanban" | "gallery" | "calendar";
	sort: { column: string; direction: "asc" | "desc" } | null;
	filters: Array<{ column: string; operator: string; value: string }>;
	groupColumn?: string;
}

export interface BaseData {
	name: string;
	columns: BaseColumn[];
	sources: Array<{ type: string; path: string }>;
	rows: BaseRow[];
	views: BaseView[];
	activeViewId: string;
}

export function getBaseData(path: string) {
	const params = new URLSearchParams({ path });
	return request<BaseData>(`/api/workspace/base?${params.toString()}`);
}

export function saveBaseData(path: string, data: BaseData) {
	return request<{ ok: true }>("/api/workspace/base", {
		method: "PUT",
		body: JSON.stringify({ path, data }),
	});
}

export function createBase(name: string, folder?: string) {
	return request<{ path: string; data: BaseData }>(
		"/api/workspace/base/create",
		{
			method: "POST",
			body: JSON.stringify({ name, folder }),
		},
	);
}

export function deleteBase(path: string) {
	const params = new URLSearchParams({ path });
	return request<{ ok: true }>(`/api/workspace/base?${params.toString()}`, {
		method: "DELETE",
	});
}
