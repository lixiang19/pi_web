import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  abortSession,
  createSession,
  getProviders,
  getSession,
  getSessions,
  getSystemInfo,
  sendMessage,
} from '@/lib/api'
import type {
  ChatMessage,
  ProvidersResponse,
  SessionSnapshot,
  SessionSummary,
  StreamEvent,
  SystemInfo,
} from '@/lib/types'

const createLocalId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const extractText = (message?: StreamEvent['message']) => {
  if (!message?.content) {
    return ''
  }

  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

export function usePiChat() {
  const info = ref<SystemInfo | null>(null)
  const providers = ref<ProvidersResponse | null>(null)
  const sessions = ref<SessionSummary[]>([])
  const activeSessionId = ref<string>('')
  const messages = ref<ChatMessage[]>([])
  const input = ref('')
  const isSending = ref(false)
  const status = ref<SessionSummary['status']>('idle')
  const error = ref('')
  const selectedModel = ref('')

  let eventSource: EventSource | null = null
  let currentAssistantMessageId = ''

  const models = computed(() => {
    if (!providers.value) {
      return []
    }

    return providers.value.providers.flatMap((provider) =>
      Object.values(provider.models).map((model) => ({
        value: `${provider.id}/${model.id}`,
        label: `${provider.name} / ${model.name}`,
      })),
    )
  })

  const activeSession = computed(() => sessions.value.find((session) => session.id === activeSessionId.value) ?? null)

  const syncSessions = (snapshot?: SessionSnapshot) => {
    if (!snapshot) {
      return
    }

    const nextSummary: SessionSummary = {
      id: snapshot.id,
      title: snapshot.title,
      cwd: snapshot.cwd,
      status: snapshot.status,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    }

    const next = sessions.value.filter((session) => session.id !== snapshot.id)
    sessions.value = [nextSummary, ...next].sort((left, right) => right.updatedAt - left.updatedAt)
  }

  const connectStream = (sessionId: string) => {
    eventSource?.close()
    currentAssistantMessageId = ''
    eventSource = new EventSource(`/api/sessions/${sessionId}/stream`)

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamEvent

      if (payload.type === 'snapshot') {
        return
      }

      if (payload.type === 'status' && payload.status) {
        status.value = payload.status
      }

      if (payload.type === 'error' && payload.error) {
        error.value = payload.error
        status.value = 'error'
        isSending.value = false
      }

      if (payload.type === 'message_start' && payload.message?.role === 'assistant') {
        currentAssistantMessageId = createLocalId()
        messages.value.push({
          id: currentAssistantMessageId,
          role: 'assistant',
          text: '',
          createdAt: Date.now(),
          pending: true,
        })
      }

      if (payload.type === 'message_update' && payload.assistantMessageEvent?.type === 'text_delta') {
        const delta = payload.assistantMessageEvent.delta ?? ''
        if (!currentAssistantMessageId) {
          currentAssistantMessageId = createLocalId()
          messages.value.push({
            id: currentAssistantMessageId,
            role: 'assistant',
            text: delta,
            createdAt: Date.now(),
            pending: true,
          })
          return
        }

        const current = messages.value.find((message) => message.id === currentAssistantMessageId)
        if (current) {
          current.text += delta
        }
      }

      if (payload.type === 'message_end' && payload.message?.role === 'assistant') {
        const text = extractText(payload.message)
        const current = messages.value.find((message) => message.id === currentAssistantMessageId)
        if (current) {
          current.text = text || current.text
          current.pending = false
        } else {
          messages.value.push({
            id: createLocalId(),
            role: 'assistant',
            text,
            createdAt: Date.now(),
          })
        }

        currentAssistantMessageId = ''
        isSending.value = false
        status.value = 'idle'
      }
    }

    eventSource.onerror = () => {
      eventSource?.close()
      eventSource = null
    }
  }

  const loadSession = async (sessionId: string) => {
    const snapshot = await getSession(sessionId)
    activeSessionId.value = snapshot.id
    messages.value = snapshot.messages
    status.value = snapshot.status
    syncSessions(snapshot)
    connectStream(snapshot.id)
  }

  const boot = async () => {
    error.value = ''
    const [systemInfo, providerPayload, sessionList] = await Promise.all([
      getSystemInfo(),
      getProviders(),
      getSessions(),
    ])

    info.value = systemInfo
    providers.value = providerPayload
    sessions.value = sessionList
    selectedModel.value = providerPayload.default.chat ?? models.value[0]?.value ?? ''

    if (sessionList[0]) {
      await loadSession(sessionList[0].id)
    }
  }

  const ensureSession = async () => {
    if (activeSessionId.value) {
      return activeSessionId.value
    }

    const snapshot = await createSession({
      cwd: info.value?.workspaceDir,
      model: selectedModel.value || undefined,
    })

    activeSessionId.value = snapshot.id
    messages.value = snapshot.messages
    status.value = snapshot.status
    syncSessions(snapshot)
    connectStream(snapshot.id)
    return snapshot.id
  }

  const submit = async () => {
    const prompt = input.value.trim()
    if (!prompt || isSending.value) {
      return
    }

    error.value = ''
    isSending.value = true
    status.value = 'streaming'
    messages.value.push({
      id: createLocalId(),
      role: 'user',
      text: prompt,
      createdAt: Date.now(),
    })

    input.value = ''

    try {
      const sessionId = await ensureSession()
      await sendMessage(sessionId, {
        prompt,
        model: selectedModel.value || undefined,
      })
      const session = sessions.value.find((item) => item.id === sessionId)
      if (session) {
        session.updatedAt = Date.now()
      }
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
      status.value = 'error'
      isSending.value = false
    }
  }

  const abort = async () => {
    if (!activeSessionId.value || !isSending.value) {
      return
    }

    await abortSession(activeSessionId.value)
    isSending.value = false
    status.value = 'idle'
  }

  onMounted(() => {
    void boot().catch((caughtError) => {
      error.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
    })
  })

  onBeforeUnmount(() => {
    eventSource?.close()
  })

  return {
    activeSession,
    activeSessionId,
    error,
    info,
    input,
    isSending,
    loadSession,
    messages,
    models,
    selectedModel,
    sessions,
    status,
    submit,
    abort,
  }
}