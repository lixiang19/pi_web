// ===== Express Extensions =====
import type { AgentSession, DefaultResourceLoader, SettingsManager, AgentToolResult } from '@mariozechner/pi-coding-agent';
import type {
  AgentSummary as ProtocolAgentSummary,
  AskInteractiveRequest as ProtocolAskInteractiveRequest,
  AskOption as ProtocolAskOption,
  AskQuestion as ProtocolAskQuestion,
  AskQuestionAnswer as ProtocolAskQuestionAnswer,
  AskToolResultDetails as ProtocolAskToolResultDetails,
  CreateWorktreeRequest as ProtocolCreateWorktreeRequest,
  DeleteWorktreeRequest as ProtocolDeleteWorktreeRequest,
  FileTreeEntry as ProtocolFileTreeEntry,
  GitBranchesResponse as ProtocolGitBranchesResponse,
  GitFileStatusItem as ProtocolGitFileStatusItem,
  PermissionDecisionAction as ProtocolPermissionDecisionAction,
  PermissionInteractiveRequest as ProtocolPermissionInteractiveRequest,
  ProjectItem as ProtocolProjectItem,
  ProviderGroup as ProtocolProviderGroup,
  ProvidersResponse as ProtocolProvidersResponse,
  ResourceCatalogResponse as ProtocolResourceCatalogResponse,
  SessionMessagesPayload as ProtocolSessionMessagesPayload,
  SessionRuntimePayload as ProtocolSessionRuntimePayload,
  SessionSnapshot as ProtocolSessionSnapshot,
  SessionSummary as ProtocolSessionSummary,
  ThinkingLevel as ProtocolThinkingLevel,
  ValidateWorktreeRequest as ProtocolValidateWorktreeRequest,
  ValidateWorktreeResponse as ProtocolValidateWorktreeResponse,
  WorktreeApiInfo as ProtocolWorktreeApiInfo,
} from '@pi/protocol';

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
export type ThinkingLevel = ProtocolThinkingLevel;
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
export type AskOption = ProtocolAskOption;
export type AskQuestion = ProtocolAskQuestion;
export type AskQuestionAnswer = ProtocolAskQuestionAnswer;
export type AskInteractiveRequest = ProtocolAskInteractiveRequest;
export type AskToolResultDetails = ProtocolAskToolResultDetails;
export interface PendingAskRecord extends AskInteractiveRequest {
  settled: boolean;
  resolve: (result: AgentToolResult<AskToolResultDetails>) => void;
  reject: (error: Error) => void;
}

export type PermissionDecisionAction = ProtocolPermissionDecisionAction;

export type PermissionInteractiveRequest = ProtocolPermissionInteractiveRequest;

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
export type FileTreeEntry = ProtocolFileTreeEntry;

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
  id: ProtocolProjectItem['id'];
  name: ProtocolProjectItem['name'];
  path: ProtocolProjectItem['path'];
  addedAt: ProtocolProjectItem['addedAt'];
  isGit: ProtocolProjectItem['isGit'];
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
export const SETTINGS_KEYS = [
  'theme',
  'themeName',
  'language',
  'sidebarCollapsed',
  'notifications',
  'defaultModel',
  'defaultAgent',
  'defaultThinkingLevel',
] as const satisfies ReadonlyArray<keyof Settings>;
export type FavoritesState = { items: FavoriteItem[] };
export type ProjectsState = { version: number; projects: Project[] };

// ===== API Response Types =====
export type SessionSummary = ProtocolSessionSummary;
export type SessionSnapshot = ProtocolSessionSnapshot;
export type SessionMessagesPayload = ProtocolSessionMessagesPayload;
export type SessionRuntimePayload = ProtocolSessionRuntimePayload;
export type ProviderInfo = ProtocolProviderGroup;
export type ProvidersResponse = ProtocolProvidersResponse;
export type AgentSummary = ProtocolAgentSummary;
export type ResourceCatalogResponse = ProtocolResourceCatalogResponse;

export interface FilesystemBrowseResult {
  homeDir: string;
  path: string;
  parent: string | null;
  entries: FileTreeEntry[];
}

// ===== Worktree API Types =====
export type WorktreeApiInfo = ProtocolWorktreeApiInfo;
export type CreateWorktreeRequest = ProtocolCreateWorktreeRequest;
export type ValidateWorktreeRequest = ProtocolValidateWorktreeRequest;
export type ValidateWorktreeResponse = ProtocolValidateWorktreeResponse;
export type DeleteWorktreeRequest = ProtocolDeleteWorktreeRequest;

// ===== Git API Types =====
export type GitFileStatusItem = ProtocolGitFileStatusItem;
export type GitStatusApiResponse = import('@pi/protocol').GitStatusResponse;
export type GitBranchesApiResponse = ProtocolGitBranchesResponse;

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
