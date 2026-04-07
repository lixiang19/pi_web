export interface ProviderModel {
  id: string
  name: string
  reasoning: boolean
}

export interface ProviderGroup {
  id: string
  name: string
  models: Record<string, ProviderModel>
}

export interface ProvidersResponse {
  providers: ProviderGroup[]
  default: {
    chat?: string
  }
}

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface ResourceSourceInfo {
  path: string
  source: string
  scope: 'user' | 'project' | 'temporary'
  origin: 'package' | 'top-level'
  baseDir?: string
}

export interface SessionSummary {
  id: string
  title: string
  cwd: string
  status: 'idle' | 'streaming' | 'error'
  createdAt: number
  updatedAt: number
  archived: boolean
  agent?: string
  model?: string
  thinkingLevel?: ThinkingLevel
  resolvedModel?: string
  resolvedThinkingLevel?: ThinkingLevel
  sessionFile: string
  parentSessionId?: string
  projectId: string
  projectRoot: string
  projectLabel: string
  branch?: string
  worktreeRoot: string
  worktreeLabel: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string
  createdAt: number
  pending?: boolean
}

export interface ChatComposerState {
  sessionId: string | null
  draftText: string
  isSending: boolean
  canAbort: boolean
  selectedModel: string
  selectedThinkingLevel: ThinkingLevel | ''
  selectedAgent: string
  hasDraft: boolean
  isFocused: boolean
  isDisabled: boolean
  pendingPrompt: string
}

export interface SessionSnapshot extends SessionSummary {
  messages: ChatMessage[]
}

export interface AgentSummary {
  name: string
  description: string
  displayName?: string
  mode: 'primary' | 'task' | 'all'
  model?: string
  thinking?: ThinkingLevel
  steps?: number
  sourceScope: 'user' | 'project'
  source: string
}

export interface SystemInfo {
  appName: string
  workspaceDir: string
  apiBase: string
  sdkVersion: string
}

export interface StreamEvent {
  type: string
  message?: {
    role?: string
    content?: Array<{ type: string; text?: string }>
  }
  assistantMessageEvent?: {
    type?: string
    delta?: string | null
  }
  status?: SessionSummary['status']
  error?: string
}

export interface FileTreeEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  relativePath: string
}

export interface FileTreeResponse {
  root: string
  directory: string
  entries: FileTreeEntry[]
}

export interface SessionMutationResponse {
  ok: true
  sessionIds: string[]
}

export interface PromptCatalogItem {
  name: string
  description: string
  content: string
  sourceInfo?: ResourceSourceInfo
}

export interface SkillCatalogItem {
  name: string
  description: string
  invocation: string
  disableModelInvocation: boolean
  sourceInfo?: ResourceSourceInfo
}

export interface CommandCatalogItem {
  name: string
  description?: string
  source: 'extension'
  sourceInfo?: ResourceSourceInfo
}

export interface ResourceCatalogResponse {
  prompts: PromptCatalogItem[]
  skills: SkillCatalogItem[]
  commands: CommandCatalogItem[]
  diagnostics: {
    prompts: string[]
    skills: string[]
    commands: string[]
  }
}

export interface SendMessagePayload {
  prompt: string
  model?: string
  agent?: string | null
  thinkingLevel?: ThinkingLevel
}