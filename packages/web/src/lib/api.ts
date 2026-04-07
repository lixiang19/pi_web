import type {
  ProvidersResponse,
  SessionSnapshot,
  SessionSummary,
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

export function getSession(sessionId: string) {
  return request<SessionSnapshot>(`/api/sessions/${sessionId}`)
}

export function createSession(payload: { title?: string; cwd?: string; model?: string }) {
  return request<SessionSnapshot>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function sendMessage(sessionId: string, payload: { prompt: string; model?: string }) {
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