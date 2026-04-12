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

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

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
  projectId: string;
  projectRoot: string;
  projectLabel: string;
  branch?: string;
  worktreeRoot: string;
  worktreeLabel: string;
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

// ============================================================================
// Pi 原始消息协议
// ============================================================================

export type MessageRole = "system" | "user" | "assistant" | "tool" | "toolResult";

export interface TextContentBlock {
  type: "text";
  text?: string;
}

export interface ThinkingContentBlock {
  type: "thinking";
  thinking?: string;
  redacted?: boolean;
}

export interface ImageContentBlock {
  type: "image";
  data?: string;
  mimeType?: string;
}

export interface ToolCallContentBlock {
  type: "toolCall";
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: "toolResult";
  id?: string;
  name?: string;
  result?: unknown;
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ImageContentBlock
  | ToolCallContentBlock
  | ToolResultContentBlock
  | {
      type: string;
      text?: string;
      thinking?: string;
      redacted?: boolean;
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
      result?: unknown;
      [key: string]: unknown;
    };

export interface ChatMessage {
  role: MessageRole;
  content: string | ContentBlock[];
  timestamp?: number;
  pending?: boolean;
  localId?: string;
}

export interface SessionHistoryMeta {
  loadedCount: number;
  totalCount: number;
  hasMoreAbove: boolean;
  limit: number;
}

export interface ChatComposerState {
  sessionId: string | null;
  draftText: string;
  isSending: boolean;
  canAbort: boolean;
  selectedModel: string;
  selectedThinkingLevel: ThinkingLevel | "";
  selectedAgent: string;
  hasDraft: boolean;
  isFocused: boolean;
  isDisabled: boolean;
  pendingPrompt: string;
}

export interface SessionSnapshot extends SessionSummary {
  messages: ChatMessage[];
  historyMeta: SessionHistoryMeta;
  interactiveRequests: AskInteractiveRequest[];
}

export interface AgentSummary {
  name: string;
  description: string;
  displayName?: string;
  mode: "primary" | "task" | "all";
  model?: string;
  thinking?: ThinkingLevel;
  steps?: number;
  sourceScope: "user" | "project";
  source: string;
}

export interface SystemInfo {
  appName: string;
  workspaceDir: string;
  apiBase: string;
  sdkVersion: string;
}

// ============================================================================
// Stream Event Types - 对齐 Pi SDK 流式事件
// ============================================================================

export type StreamEventType =
  | "snapshot"
  | "status"
  | "error"
  | "message_start"
  | "message_update"
  | "message_end";

export type AssistantMessageEventType =
  | "text_start"
  | "text_delta"
  | "text_end"
  | "thinking_start"
  | "thinking_delta"
  | "thinking_end"
  | "toolcall_start"
  | "toolcall_delta"
  | "toolcall_end";

export interface StreamEvent {
  type: StreamEventType;
  session?: SessionSnapshot;
  status?: SessionSummary["status"];
  error?: string;
  message?: ChatMessage;
  assistantMessageEvent?: {
    type?: AssistantMessageEventType;
    contentIndex?: number;
    delta?: string | null;
    content?: string;
    toolCall?: {
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    };
  };
}

export interface FileTreeEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  relativePath: string;
}

export interface FileTreeResponse {
  root: string;
  directory: string;
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

// ============================================================================
// Worktree API Types
// ============================================================================

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

// ============================================================================
// Git API Types
// ============================================================================

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
