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

export interface SessionSummary {
  id: string
  title: string
  cwd: string
  status: 'idle' | 'streaming' | 'error'
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string
  createdAt: number
  pending?: boolean
}

export interface SessionSnapshot extends SessionSummary {
  messages: ChatMessage[]
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