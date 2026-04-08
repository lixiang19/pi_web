// ===== Express Extensions =====
import type { AgentSession, DefaultResourceLoader, SettingsManager } from '@mariozechner/pi-coding-agent';

declare global {
  namespace Express {
    interface Request {
      // 扩展请求类型如有需要
    }
  }
}

// ===== Agent Types =====
export type AgentMode = 'primary' | 'task' | 'all';
export type AgentScope = 'user' | 'project';
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface AgentConfig {
  name: string;
  description: string;
  displayName?: string;
  mode: AgentMode;
  model?: string;
  thinking?: ThinkingLevel;
  steps?: number;
  enabled: boolean;
  permission?: AgentPermission;
  systemPrompt: string;
  source: string;
  sourceScope: AgentScope;
}

export interface AgentPermission {
  read?: 'allow' | 'deny' | PermissionRules;
  grep?: 'allow' | 'deny' | PermissionRules;
  find?: 'allow' | 'deny' | PermissionRules;
  ls?: 'allow' | 'deny' | PermissionRules;
  bash?: 'allow' | 'deny' | PermissionRules;
  question?: 'allow' | 'deny' | PermissionRules;
  task?: 'allow' | 'deny' | PermissionRules;
  edit?: 'allow' | 'deny' | PermissionRules | PermissionRule[];
}

export interface PermissionRule {
  pattern: string;
  action: 'allow' | 'deny';
}

export interface PermissionRules {
  [pattern: string]: 'allow' | 'deny';
}

export interface CompiledPermissionPolicy {
  raw: AgentPermission;
  cwd: string;
  activeToolNames: string[];
  editRules: PermissionRule[];
  toolActions: Record<string, string>;
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
  selectedAgentName?: string;
  // AgentConfigInternal from agents.ts
  selectedAgentConfig: {
    name: string;
    description: string;
    displayName?: string;
    mode: AgentMode;
    model?: string;
    thinking?: ThinkingLevel;
    steps?: number;
    enabled: boolean;
    permission: unknown;
    systemPrompt: string;
    source: string;
    sourceScope: AgentScope;
  } | null;
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

export interface WorkspaceScope {
  workspaceProjectId: string;
  allowedRoots: string[];
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
export interface Settings {
  theme: 'system' | 'light' | 'dark';
  language: string;
  sidebarCollapsed: boolean;
  notifications: boolean;
}

export interface FavoriteItem {
  id: string;
  name: string;
  type: string;
  data?: unknown;
  createdAt: number;
}

export interface FavoritesState {
  items: FavoriteItem[];
}

export interface Project {
  id: string;
  name: string;
  path: string;
  addedAt: number;
}

export interface ProjectsState {
  version: number;
  projects: Project[];
}

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
  branch?: string;
  worktreeRoot: string;
  worktreeLabel: string;
}

export interface MessageBlock {
  type: 'text' | 'thinking' | 'toolCall' | 'toolResult' | 'unknown';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

export interface SerializedMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  text: string;
  contentBlocks: MessageBlock[];
  createdAt: number;
}

export interface SessionSnapshot extends SessionSummary {
  messages: SerializedMessage[];
  historyMeta: {
    loadedCount: number;
    totalCount: number;
    hasMoreAbove: boolean;
    limit: number;
  };
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
  steps?: number;
  sourceScope: AgentScope;
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

// ===== Error Types =====
export interface HttpError extends Error {
  statusCode: number;
  code?: string;
}
