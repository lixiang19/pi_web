import type {
  AgentSummary,
  FileTreeResponse,
  ProvidersResponse,
  ResourceCatalogResponse,
  SendMessagePayload,
  SessionMutationResponse,
  SessionSnapshot,
  SessionSummary,
  ThinkingLevel,
  SystemInfo,
} from './types'

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function getSystemInfo() {
  return request<SystemInfo>('/api/system/info')
}

export function getProviders() {
  return request<ProvidersResponse>('/api/providers')
}

export function getSessions() {
  return request<SessionSummary[]>('/api/sessions')
}

export function getAgents(cwd?: string) {
  const params = new URLSearchParams()

  if (cwd) {
    params.set('cwd', cwd)
  }

  return request<AgentSummary[]>(`/api/agents${params.size > 0 ? `?${params.toString()}` : ''}`)
}

export function getResources(options?: { cwd?: string; sessionId?: string }) {
  const params = new URLSearchParams()

  if (options?.cwd) {
    params.set('cwd', options.cwd)
  }

  if (options?.sessionId) {
    params.set('sessionId', options.sessionId)
  }

  return request<ResourceCatalogResponse>(`/api/resources${params.size > 0 ? `?${params.toString()}` : ''}`)
}

export function getSession(sessionId: string) {
  return request<SessionSnapshot>(`/api/sessions/${sessionId}`)
}

export function createSession(payload: {
  title?: string
  cwd?: string
  model?: string
  thinkingLevel?: ThinkingLevel | null
  parentSessionId?: string
  agent?: string | null
}) {
  return request<SessionSnapshot>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateSession(sessionId: string, payload: {
  title?: string
  model?: string | null
  thinkingLevel?: ThinkingLevel | null
  agent?: string | null
}) {
  return request<SessionSnapshot>(`/api/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function renameSession(sessionId: string, payload: { title: string }) {
  return updateSession(sessionId, payload)
}

export function archiveSession(sessionId: string, payload: { archived: boolean }) {
  return request<SessionMutationResponse>(`/api/sessions/${sessionId}/archive`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteSession(sessionId: string) {
  return request<SessionMutationResponse>(`/api/sessions/${sessionId}`, {
    method: 'DELETE',
  })
}

export function sendMessage(sessionId: string, payload: SendMessagePayload) {
  return request<{ ok: true }>(`/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function abortSession(sessionId: string) {
  return request<{ ok: true }>(`/api/sessions/${sessionId}/abort`, {
    method: 'POST',
  })
}

export function getFileTree(path?: string, root?: string) {
  const params = new URLSearchParams()

  if (path) {
    params.set('path', path)
  }

  if (root) {
    params.set('root', root)
  }

  return request<FileTreeResponse>(`/api/files/tree${params.size > 0 ? `?${params.toString()}` : ''}`)
}