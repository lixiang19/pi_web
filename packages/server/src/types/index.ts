// ===== Express Extensions =====
import type { AgentSession, DefaultResourceLoader, SettingsManager, AgentToolResult } from '@mariozechner/pi-coding-agent';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Request {
      // 扩展请求类型如有需要
    }
  }
}

// ===== Agent Types =====
export type AgentMode = 'primary' | 'task' | 'all';
export type AgentScope = 'user' | 'project';
export type AgentSourceScope = 'default' | AgentScope;
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export interface AgentConfig {
  name: string;
  description: string;
  displayName?: string;
  mode: AgentMode;
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  skills?: string[];
  inheritContext?: boolean;
  runInBackground?: boolean;
  enabled: boolean;
  permission?: AgentPermission;
  systemPrompt: string;
  source: string;
  sourceScope: AgentSourceScope;
}

export type PermissionAction = 'allow' | 'ask' | 'deny';
export type LogicalPermissionKey =
  | 'read'
  | 'grep'
  | 'find'
  | 'ls'
  | 'bash'
  | 'ask'
  | 'task'
  | 'edit';
export interface AgentPermission {
  read?: PermissionAction | PermissionRules;
  grep?: PermissionAction | PermissionRules;
  find?: PermissionAction | PermissionRules;
  ls?: PermissionAction | PermissionRules;
  bash?: PermissionAction | PermissionRules;
  ask?: PermissionAction | PermissionRules;
  task?: PermissionAction | PermissionRules;
  edit?: PermissionAction | PermissionRules | PermissionRule[];
}
export interface PermissionRule {
  pattern: string;
  action: PermissionAction;
}
export interface PermissionRules {
  [pattern: string]: PermissionAction;
}
export interface CompiledPermissionPolicy {
  raw: AgentPermission;
  cwd: string;
  activeToolNames: string[];
  rulesByPermission: Partial<Record<LogicalPermissionKey, PermissionRule[]>>;
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
export interface AskToolResultDetails {
  request: AskInteractiveRequest;
  answers: AskQuestionAnswer[];
  dismissed: boolean;
}
export interface PendingAskRecord extends AskInteractiveRequest {
  settled: boolean;
  resolve: (result: AgentToolResult<AskToolResultDetails>) => void;
  reject: (error: Error) => void;
}

export type PermissionDecisionAction = 'once' | 'always' | 'reject';

export interface PermissionInteractiveRequest {
  id: string;
  toolCallId: string;
  toolName: string;
  permissionKey: LogicalPermissionKey;
  title: string;
  message: string;
  subject: string;
  suggestedPattern?: string;
  createdAt: number;
}

export interface PendingPermissionRecord extends PermissionInteractiveRequest {
  resolve: (action: PermissionDecisionAction) => void;
  reject: (error: Error) => void;
}

// ===== Session Types =====
export interface TurnBudget {
  maxTurns?: number;
  usedTurns: number;
  exhausted: boolean;
}

export interface SessionRecord {
  id: string;
  sessionFile: string;
  parentSessionPath?: string;
  cwd: string;
  status: 'idle' | 'streaming' | 'error';
  createdAt: number;
  updatedAt: number;
  session: AgentSession;
  settingsManager: SettingsManager;
  resourceLoader: DefaultResourceLoader;
  unsubscribe: (() => void) | null;
  clients: Set<import('http').ServerResponse>;
  defaultToolNames: string[];
  pendingAskRecords: Map<string, PendingAskRecord>;
  pendingPermissionRecords: Map<string, PendingPermissionRecord>;
  runtimePermissionRules: Partial<Record<LogicalPermissionKey, PermissionRule[]>>;
  selectedAgentName?: string;
  selectedAgentConfig: AgentConfig | null;
  selectedAgentSignature: string;
  explicitModelSpec?: string;
  explicitThinkingLevel?: ThinkingLevel;
  resolvedModelSpec?: string;
  resolvedThinkingLevel?: ThinkingLevel;
  selectedPermissionPolicy: CompiledPermissionPolicy | null;
  turnBudget: TurnBudget;
}

// ===== Session Metadata Types =====
export interface SessionMetadata {
  id: string;
  title: string;
  cwd: string;
  sessionFile: string;
  parentSessionPath?: string;
  createdAt: number;
  updatedAt: number;
  agent?: string;
  model?: string;
  thinkingLevel?: string;
}

export interface SessionMetadataState {
  version: number;
  sessions: Record<string, SessionMetadata & { archived?: boolean }>;
}

export interface SessionSelection {
  agent?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

// ===== Project Context Types =====
export interface WorktreeInfo {
  path: string;
  branch?: string;
  label: string;
}

export interface ProjectContext {
  isGit: boolean;
  projectId: string;
  projectRoot: string;
  projectLabel: string;
  worktreeRoot: string;
  worktreeLabel: string;
  branch?: string;
  worktrees: WorktreeInfo[];
}


// ===== File Tree Types =====
export interface FileTreeEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  relativePath: string;
}

export interface FileTreeResult {
  root: string;
  directory: string;
  entries: FileTreeEntry[];
}

// ===== Storage Types =====
// ===== Storage Types =====
export interface FavoriteItem {
  id: string;
  name: string;
  type: string;
  data?: unknown;
  createdAt: number;
}
export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

/**
 * Unified settings stored in ~/.pi/ridge-settings.json
 */
export interface RidgeSettings {
  version: number;
  // Core UI settings
  theme: 'system' | 'light' | 'dark';
  themeName: string;
  language: string;
  sidebarCollapsed: boolean;
  notifications: boolean;
  // Default composer selections (persisted preferences)
  defaultModel: string;
  defaultAgent: string;
  defaultThinkingLevel: ThinkingLevel;
  // Collections
  projects: Project[];
  favorites: FavoriteItem[];
}

/**
 * Legacy types kept for API backward compatibility
 */
export type Settings = Omit<RidgeSettings, 'version' | 'projects' | 'favorites'>;
export type FavoritesState = { items: FavoriteItem[] };
export type ProjectsState = { version: number; projects: Project[] };

// ===== API Response Types =====
export interface SessionSummary {
  id: string;
  title: string;
  cwd: string;
  status: 'idle' | 'streaming' | 'error';
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
  isGit: boolean;
  branch?: string;
  worktreeRoot: string;
  worktreeLabel: string;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'toolResult';

export interface TextContentBlock {
  type: 'text';
  text?: string;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking?: string;
  redacted?: boolean;
}

export interface ImageContentBlock {
  type: 'image';
  data?: string;
  mimeType?: string;
}

export interface ToolCallContentBlock {
  type: 'toolCall';
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'toolResult';
  id?: string;
  name?: string;
  result?: unknown;
}

export type MessageBlock = {
  type?: string;
  [key: string]: unknown;
};

export interface SerializedMessage {
  role: MessageRole;
  content: string | MessageBlock[];
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  details?: unknown;
  isError?: boolean;
}

export interface SessionSnapshot extends SessionSummary {
  messages: SerializedMessage[];
  historyMeta: {
    loadedCount: number;
    totalCount: number;
    hasMoreAbove: boolean;
    limit: number;
  };
  interactiveRequests: AskInteractiveRequest[];
  permissionRequests: PermissionInteractiveRequest[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: Record<string, {
    id: string;
    name: string;
    reasoning: boolean;
  }>;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
  default: {
    chat?: string;
  };
}

export interface AgentSummary {
  name: string;
  description: string;
  displayName?: string;
  mode: AgentMode;
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  skills?: string[];
  inheritContext?: boolean;
  runInBackground?: boolean;
  enabled: boolean;
  permission?: AgentPermission;
  sourceScope: AgentSourceScope;
  source: string;
}


export interface ResourceCatalogResponse {
  prompts: Array<{
    name: string;
    description: string;
    content: string;
    sourceInfo?: import('@mariozechner/pi-coding-agent').SourceInfo;
  }>;
  skills: Array<{
    name: string;
    description: string;
    invocation: string;
    disableModelInvocation?: boolean;
    sourceInfo?: import('@mariozechner/pi-coding-agent').SourceInfo;
  }>;
  commands: Array<{
    name: string;
    description: string;
    source: string;
    sourceInfo?: import('@mariozechner/pi-coding-agent').SourceInfo;
  }>;
  diagnostics: {
    prompts: string[];
    skills: string[];
    commands: string[];
  };
}

export interface FilesystemBrowseResult {
  homeDir: string;
  path: string;
  parent: string | null;
  entries: FileTreeEntry[];
}

// ===== Worktree API Types =====
export interface WorktreeApiInfo {
  path: string;
  branch?: string;
  label: string;
  projectRoot: string;
}

export interface CreateWorktreeRequest {
  mode: 'new' | 'existing';
  branchName?: string;
  existingBranch?: string;
  worktreeName?: string;
  startRef?: string;
}

export interface ValidateWorktreeRequest {
  mode: 'new' | 'existing';
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

export interface DeleteWorktreeRequest {
  worktreePath: string;
  deleteLocalBranch?: boolean;
  deleteRemoteBranch?: boolean;
}

// ===== Git API Types =====
export interface GitFileStatusItem {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitStatusApiResponse {
  current: string | null;
  tracking: string | null;
  files: GitFileStatusItem[];
  ahead: number;
  behind: number;
}

export interface GitBranchesApiResponse {
  current: string | null;
  all: string[];
  branches: Record<string, { current: boolean; tracking?: string }>;
}

export interface GitRemoteApiInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

// ===== Error Types =====
export interface HttpError extends Error {
  statusCode: number;
  code?: string;
}
