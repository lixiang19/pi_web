export type {
  AgentSummary,
  AutomationRule,
  AutomationRuleInput,
  AutomationRunNowResponse,
  AutomationSchedule,
  AutomationsResponse,
  AskInteractiveRequest,
  AskOption,
  AskQuestion,
  AskQuestionAnswer,
  AskToolCallArguments,
  AskToolResultDetails,
  AssistantMessageEvent,
  CommandCatalogItem,
  CreateWorktreeRequest,
  DeleteWorktreeRequest,
  FilePreviewKind,
  FilePreviewPayload,
  FilePreviewWindowPayload,
  FileSaveRequest,
  FileSaveResponse,
  DirectoryBrowseResponse,
  FileTreeEntry,
  FileTreeResponse,
  GitBranchesResponse,
  GitFileStatusItem,
  GitRemoteInfo,
  GitRepositoryStatusResponse,
  GitStatusResponse,
  PiAssistantMessage,
  PiImageContent,
  PiMessage,
  PiTextContent,
  PiThinkingContent,
  PiToolCall,
  PiToolResultMessage,
  PermissionDecisionAction,
  PermissionInteractiveRequest,
  ProjectItem,
  ProjectsResponse,
  PromptCatalogItem,
  ProviderGroup,
  ProviderModel,
  ProvidersResponse,
  ResourceCatalogResponse,
  ResourceSourceInfo,
  SendMessagePayload,
  SessionContextSummary,
  SessionHydratePayload,
  SessionHistoryMeta,
  SessionMessagesPayload,
  SessionMutationResponse,
  SessionRuntimePayload,
  SessionSnapshot,
  SessionSummary,
  SkillCatalogItem,
  StreamErrorEvent,
  StreamEvent,
  StreamEventType,
  StreamMessageEvent,
  StreamSnapshotEvent,
  StreamStatusEvent,
  SystemInfo,
  TerminalCreateRequest,
  TerminalListResponse,
  TerminalMutationResponse,
  TerminalRestartRequest,
  TerminalSnapshot,
  TerminalStatus,
  TerminalUpdateRequest,
  ThinkingLevel,
  ValidateWorktreeRequest,
  ValidateWorktreeResponse,
  WorktreeApiInfo,
  WorktreesResponse,
} from "@pi/protocol";

import type { PiMessage, ThinkingLevel } from "@pi/protocol";

export interface ChatComposerState {
  sessionId: string | null;
  draftText: string;
  isSending: boolean;
  canAbort: boolean;
  selectedModel: string;
  selectedThinkingLevel: ThinkingLevel;
  selectedAgent: string;
  hasDraft: boolean;
  isFocused: boolean;
  isDisabled: boolean;
  pendingPrompt: string;
}

export interface UiConversationMessage {
  message: PiMessage;
  pending?: boolean;
  localId?: string;
}

export interface UiSessionSnapshot
  extends Omit<
    import("@pi/protocol").SessionSnapshot,
    "messages"
  > {
  messages: UiConversationMessage[];
}

// ===== Notes =====

export interface NoteListItem {
  name: string;
  path: string;
  relativePath: string;
  updatedAt: number;
  size: number;
}

export interface NoteListResponse {
  root: string;
  entries: NoteListItem[];
}

export interface NoteContentResponse {
  path: string;
  relativePath: string;
  content: string;
  updatedAt: number;
  size: number;
}

export interface NoteSaveResponse {
  path: string;
  relativePath: string;
  size: number;
  updatedAt: number;
}

export interface NoteCreateResponse {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  updatedAt: number;
}
