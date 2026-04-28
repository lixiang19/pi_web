import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
} from "@mariozechner/pi-ai";

export type { ThinkingLevel } from "@mariozechner/pi-agent-core";
export type {
  AssistantMessage,
  AssistantMessageEvent,
  ImageContent,
  Message,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@mariozechner/pi-ai";

export type PiMessage = Message;
export type PiAssistantMessage = AssistantMessage;
export type PiToolResultMessage = ToolResultMessage;
export type PiTextContent = TextContent;
export type PiThinkingContent = ThinkingContent;
export type PiImageContent = ImageContent;
export type PiToolCall = ToolCall;

export interface ProviderModel {
  id: string;
  name: string;
  reasoning: boolean;
}

export interface ProviderGroup {
  id: string;
  name: string;
  models: Record<string, ProviderModel>;
}

export interface ProvidersResponse {
  providers: ProviderGroup[];
  default: {
    chat?: string;
  };
}

export type AutomationSchedule =
  | {
      type: "daily";
      time: string;
    }
  | {
      type: "weekly";
      time: string;
      weekdays: number[];
    }
  | {
      type: "interval";
      everyMinutes: number;
    };

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  cwd: string;
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  schedule: AutomationSchedule;
  prompt: string;
  nextRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRuleInput {
  name: string;
  enabled: boolean;
  cwd: string;
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  schedule: AutomationSchedule;
  prompt: string;
}

export interface AutomationsResponse {
  rules: AutomationRule[];
}

export interface AutomationRunNowResponse {
  sessionId: string;
}

export interface ResourceSourceInfo {
  path: string;
  source: string;
  scope: "user" | "project" | "temporary";
  origin: "package" | "top-level";
  baseDir?: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  status: "idle" | "streaming" | "error";
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  resolvedModel?: string;
  resolvedThinkingLevel?: ThinkingLevel;
  sessionFile: string;
  parentSessionId?: string;
  contextId?: string;
  projectId?: string;
  projectRoot?: string;
  projectLabel?: string;
  isGit?: boolean;
  branch?: string;
  worktreeRoot?: string;
  worktreeLabel?: string;
}

export interface SessionContextSummary {
  contextId: string;
  cwd: string;
  projectId: string;
  projectLabel: string;
  projectRoot: string;
  worktreeRoot: string;
  worktreeLabel: string;
  branch?: string;
  isGit: boolean;
}

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  id: string;
  header?: string;
  question: string;
  description?: string;
  options?: AskOption[];
  multiple?: boolean;
  allowCustom?: boolean;
}

export interface AskQuestionAnswer {
  questionId: string;
  values: string[];
}

export interface AskInteractiveRequest {
  id: string;
  toolCallId: string;
  title: string;
  message?: string;
  questions: AskQuestion[];
  createdAt: number;
}

export interface AskToolCallArguments {
  title?: string;
  message?: string;
  questions: AskQuestion[];
}

export interface AskToolResultDetails {
  request: AskInteractiveRequest;
  answers: AskQuestionAnswer[];
  dismissed: boolean;
}

export type PermissionDecisionAction = "once" | "always" | "reject";

export interface PermissionInteractiveRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  permissionKey:
    | "read"
    | "grep"
    | "find"
    | "ls"
    | "bash"
    | "ask"
    | "task"
    | "edit";
  title: string;
  message: string;
  subject: string;
  suggestedPattern?: string;
  createdAt: number;
}

export interface SessionHistoryMeta {
  loadedRounds: number;
  totalRounds: number;
  hasMoreAbove: boolean;
  roundWindow: number;
}

export interface SessionSnapshot extends SessionSummary {
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  resolvedModel?: string;
  resolvedThinkingLevel?: ThinkingLevel;
  projectId?: string;
  projectRoot?: string;
  projectLabel?: string;
  isGit?: boolean;
  branch?: string;
  worktreeRoot?: string;
  worktreeLabel?: string;
  messages: PiMessage[];
  historyMeta: SessionHistoryMeta;
  interactiveRequests: AskInteractiveRequest[];
  permissionRequests: PermissionInteractiveRequest[];
}

export interface SessionMessagesPayload {
  sessionId: string;
  messages: PiMessage[];
  historyMeta: SessionHistoryMeta;
  interactiveRequests: AskInteractiveRequest[];
  permissionRequests: PermissionInteractiveRequest[];
}

export interface SessionRuntimePayload {
  sessionId: string;
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  resolvedModel?: string;
  resolvedThinkingLevel?: ThinkingLevel;
}

export interface SessionHydratePayload extends SessionMessagesPayload {
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  resolvedModel?: string;
  resolvedThinkingLevel?: ThinkingLevel;
}

export interface AgentSummary {
  name: string;
  description: string;
  displayName?: string;
  mode: "primary" | "task" | "all";
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  graceTurns?: number;
  skills?: string[];
  inheritContext?: boolean;
  runInBackground?: boolean;
  enabled: boolean;
  permission?: Record<string, unknown>;
  sourceScope: "default" | "user" | "project";
  source: string;
}

export interface SystemInfo {
  appName: string;
  workspaceDir: string;
  chatProjectId: string;
  chatProjectPath: string;
  chatProjectLabel: string;
  apiBase: string;
  sdkVersion: string;
}

export type StreamEventType =
  | "snapshot"
  | "status"
  | "error"
  | "message_start"
  | "message_update"
  | "message_end";

export interface StreamSnapshotEvent {
  type: "snapshot";
  sessionId: string;
  status?: SessionSummary["status"];
  messages: PiMessage[];
  historyMeta: SessionHistoryMeta;
  interactiveRequests: AskInteractiveRequest[];
  permissionRequests: PermissionInteractiveRequest[];
}

export interface StreamStatusEvent {
  type: "status";
  sessionId?: string;
  status?: SessionSummary["status"];
}

export interface StreamErrorEvent {
  type: "error";
  sessionId?: string;
  error?: string;
}

export interface StreamMessageEvent {
  type: "message_start" | "message_update" | "message_end";
  sessionId?: string;
  status?: SessionSummary["status"];
  message?: PiMessage;
  assistantMessageEvent?: AssistantMessageEvent;
}

export type StreamEvent =
  | StreamSnapshotEvent
  | StreamStatusEvent
  | StreamErrorEvent
  | StreamMessageEvent;

export interface FileTreeEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  relativePath: string;
  size: number | null;
  modifiedAt: number;
  extension: string;
}

export interface FileTreeResponse {
  root: string;
  directory: string;
  entries: FileTreeEntry[];
}

export type FilePreviewKind =
  | "markdown"
  | "code"
  | "text"
  | "html"
  | "image"
  | "unsupported";

export interface FilePreviewPayload {
  root: string;
  path: string;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  previewKind: FilePreviewKind;
  content?: string;
  isLargeFile?: boolean;
  previewLineCount?: number;
  nextStartLine?: number;
  readOnly: boolean;
}

export interface FilePreviewWindowPayload {
  root: string;
  path: string;
  startLine: number;
  lineCount: number;
  content: string;
  hasMore: boolean;
  nextStartLine?: number;
}

export interface FileSaveRequest {
  root: string;
  path: string;
  content: string;
}

export interface FileSaveResponse {
  root: string;
  path: string;
  size: number;
  savedAt: number;
}

export interface FileEntryCreateRequest {
  root: string;
  directory: string;
  name: string;
  kind: "file" | "directory";
}

export interface FileEntryMoveRequest {
  root: string;
  path: string;
  targetDirectory?: string;
  name?: string;
}

export interface FileEntryMutationResponse {
  entry: FileTreeEntry;
}

export interface FileEntryTrashResponse {
  root: string;
  path: string;
  trashedAt: number;
}

export interface FileUploadResponse {
  entries: FileTreeEntry[];
}

export interface DirectoryBrowseResponse {
  homeDir: string;
  path: string;
  parent: string | null;
  entries: FileTreeEntry[];
}

export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  addedAt: number;
  isGit: boolean;
}

export interface ProjectsResponse {
  projects: ProjectItem[];
}

export interface SessionMutationResponse {
  ok: true;
  sessionIds: string[];
}

export interface PromptCatalogItem {
  name: string;
  description: string;
  content: string;
  sourceInfo?: ResourceSourceInfo;
}

export interface SkillCatalogItem {
  name: string;
  description: string;
  invocation: string;
  disableModelInvocation: boolean;
  sourceInfo?: ResourceSourceInfo;
}

export interface CommandCatalogItem {
  name: string;
  description?: string;
  source: "extension";
  sourceInfo?: ResourceSourceInfo;
}

export interface ResourceCatalogResponse {
  prompts: PromptCatalogItem[];
  skills: SkillCatalogItem[];
  commands: CommandCatalogItem[];
  diagnostics: {
    prompts: string[];
    skills: string[];
    commands: string[];
  };
}

export interface SendMessagePayload {
  prompt: string;
  model?: string;
  agent?: string | null;
  thinkingLevel?: ThinkingLevel;
}

export interface WorktreeApiInfo {
  path: string;
  branch?: string;
  label: string;
  projectRoot: string;
}

export interface WorktreesResponse {
  worktrees: WorktreeApiInfo[];
}

export interface ValidateWorktreeRequest {
  mode: "new" | "existing";
  branchName?: string;
  existingBranch?: string;
  worktreeName?: string;
}

export interface ValidateWorktreeResponse {
  ok: boolean;
  branchError?: string;
  worktreeError?: string;
  resolvedPath?: string;
}

export interface CreateWorktreeRequest {
  mode: "new" | "existing";
  branchName?: string;
  existingBranch?: string;
  worktreeName?: string;
  startRef?: string;
}

export interface DeleteWorktreeRequest {
  worktreePath: string;
  deleteLocalBranch?: boolean;
  deleteRemoteBranch?: boolean;
}

export interface GitFileStatusItem {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitStatusResponse {
  current: string | null;
  tracking: string | null;
  files: GitFileStatusItem[];
  ahead: number;
  behind: number;
}

export interface GitBranchesResponse {
  current: string | null;
  all: string[];
  branches: Record<string, { current: boolean; tracking?: string }>;
}

export interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitRepositoryStatusResponse {
  isGitRepo: boolean;
}

export type TerminalStatus =
  | "starting"
  | "running"
  | "disconnected"
  | "exited"
  | "error";

export interface TerminalSnapshot {
  id: string;
  title: string;
  cwd: string;
  shell: string;
  status: TerminalStatus;
  cols: number;
  rows: number;
  createdAt: number;
  updatedAt: number;
  exitCode?: number | null;
  errorMessage?: string | null;
}

export interface TerminalListResponse {
  terminals: TerminalSnapshot[];
}

export interface TerminalCreateRequest {
  cwd?: string;
  title?: string;
  cols?: number;
  rows?: number;
}

export interface TerminalUpdateRequest {
  title: string;
}

export interface TerminalRestartRequest {
  cwd: string;
  cols?: number;
  rows?: number;
}

export interface TerminalMutationResponse {
  ok: true;
  terminalId: string;
}
