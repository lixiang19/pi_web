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

// ============================================================================
// Content Block Types - 对齐 Pi SDK 原生类型
// ============================================================================

export interface TextContentBlock {
  type: "text";
  text: string;
  textSignature?: string;
}

export interface ThinkingContentBlock {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

export interface ImageContentBlock {
  type: "image";
  data: string;
  mimeType: string;
}

export interface ToolCallContentBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
}

export interface ToolResultContentBlock {
  type: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContentBlock | ImageContentBlock)[];
  isError: boolean;
}

export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ImageContentBlock
  | ToolCallContentBlock
  | ToolResultContentBlock;

// ============================================================================
// ChatMessage - 扩展以支持完整富内容
// ============================================================================

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string; // 纯文本摘要（用于快速预览）
  contentBlocks: ContentBlock[]; // 完整内容块数组
  createdAt: number;
  pending?: boolean;
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
  message?: {
    role?: string;
    content?: Array<
      | {
          type: "text";
          text?: string;
        }
      | {
          type: "thinking";
          thinking?: string;
          redacted?: boolean;
        }
      | {
          type: "toolCall";
          id?: string;
          name?: string;
          arguments?: Record<string, unknown>;
        }
      | {
          type: "toolResult";
          toolCallId?: string;
          toolName?: string;
          content?: Array<
            | {
                type: "text";
                text?: string;
              }
            | {
                type: "image";
                data?: string;
                mimeType?: string;
              }
          >;
          isError?: boolean;
        }
      | {
          type: string;
          text?: string;
          thinking?: string;
          redacted?: boolean;
          id?: string;
          name?: string;
          arguments?: Record<string, unknown>;
          toolCallId?: string;
          toolName?: string;
          content?: Array<
            | {
                type: "text";
                text?: string;
              }
            | {
                type: "image";
                data?: string;
                mimeType?: string;
              }
          >;
          isError?: boolean;
        }
    >;
  };
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
