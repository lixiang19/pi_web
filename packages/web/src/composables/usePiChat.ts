import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import {
  abortSession,
  archiveSession,
  createSession,
  deleteSession,
  getAgents,
  getProviders,
  getResources,
  getSession,
  getSessions,
  getSystemInfo,
  renameSession,
  sendMessage,
  updateSession,
} from '@/lib/api'
import type {
  AgentSummary,
  ChatComposerState,
  ChatMessage,
  ProvidersResponse,
  ResourceCatalogResponse,
  SessionSnapshot,
  SessionSummary,
  StreamEvent,
  SystemInfo,
  ThinkingLevel,
} from '@/lib/types'

const createLocalId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const fallbackSessionTitle = '新会话'
const draftStorageKey = 'pi-web.chat-composer.drafts.v1'
const newSessionDraftKey = '__pi_new_session__'

const createEmptyResources = (): ResourceCatalogResponse => ({
  prompts: [],
  skills: [],
  commands: [],
  diagnostics: {
    prompts: [],
    skills: [],
    commands: [],
  },
})

const extractText = (message?: StreamEvent['message']) => {
  if (!message?.content) {
    return ''
  }

  return message.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

const loadDraftMap = () => {
  if (typeof window === 'undefined') {
    return {} as Record<string, string>
  }

  try {
    const raw = window.localStorage.getItem(draftStorageKey)
    if (!raw) {
      return {} as Record<string, string>
    }

    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed as Record<string, string> : {}
  } catch {
    return {} as Record<string, string>
  }
}

const persistDraftMap = (drafts: Record<string, string>) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(draftStorageKey, JSON.stringify(drafts))
}

const getDraftKey = (sessionId: string | null | undefined) => sessionId || newSessionDraftKey

const parseAgentMention = (text: string, agents: AgentSummary[]) => {
  const matches = text.matchAll(/(^|\s)@([a-z0-9-]+)/gi)

  for (const match of matches) {
    const candidate = match[2]?.toLowerCase()
    if (!candidate) {
      continue
    }

    if (agents.some((agent) => agent.name === candidate)) {
      return candidate
    }
  }

  return ''
}

export function usePiChat() {
  const info = ref<SystemInfo | null>(null)
  const providers = ref<ProvidersResponse | null>(null)
  const sessions = ref<SessionSummary[]>([])
  const activeSessionId = ref('')
  const messages = ref<ChatMessage[]>([])
  const isSending = ref(false)
  const status = ref<SessionSummary['status']>('idle')
  const error = ref('')
  const resourceError = ref('')
  const agents = ref<AgentSummary[]>([])
  const resources = ref<ResourceCatalogResponse>(createEmptyResources())
  const draftMap = ref<Record<string, string>>(loadDraftMap())
  const composer = reactive<ChatComposerState>({
    sessionId: null,
    draftText: '',
    isSending: false,
    canAbort: false,
    selectedModel: '',
    selectedThinkingLevel: '',
    selectedAgent: '',
    hasDraft: false,
    isFocused: false,
    isDisabled: false,
    pendingPrompt: '',
  })

  let eventSource: EventSource | null = null
  let currentAssistantMessageId = ''
  let suppressDraftPersistence = false

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
  const selectedAgentSummary = computed(() => agents.value.find((agent) => agent.name === composer.selectedAgent) ?? null)
  const defaultModel = computed(() => providers.value?.default.chat ?? models.value[0]?.value ?? '')
  const effectiveModel = computed(
    () => composer.selectedModel
      || activeSession.value?.resolvedModel
      || selectedAgentSummary.value?.model
      || defaultModel.value,
  )
  const effectiveThinkingLevel = computed<ThinkingLevel>(
    () => composer.selectedThinkingLevel
      || activeSession.value?.resolvedThinkingLevel
      || selectedAgentSummary.value?.thinking
      || 'medium',
  )
  const mentionedAgent = computed(() => parseAgentMention(composer.draftText, agents.value))
  const effectiveAgent = computed(() => mentionedAgent.value || composer.selectedAgent || '')

  const updateDraftValue = (sessionId: string | null, value: string) => {
    const key = getDraftKey(sessionId)
    if (value.trim()) {
      draftMap.value = {
        ...draftMap.value,
        [key]: value,
      }
    } else if (draftMap.value[key] !== undefined) {
      const nextDrafts = { ...draftMap.value }
      delete nextDrafts[key]
      draftMap.value = nextDrafts
    }

    persistDraftMap(draftMap.value)
  }

  const clearDraftValue = (sessionId: string | null) => {
    updateDraftValue(sessionId, '')
  }

  const moveDraftValue = (fromSessionId: string | null, toSessionId: string) => {
    const fromKey = getDraftKey(fromSessionId)
    const value = draftMap.value[fromKey]
    if (!value?.trim()) {
      return
    }

    const nextDrafts = { ...draftMap.value }
    delete nextDrafts[fromKey]
    nextDrafts[getDraftKey(toSessionId)] = value
    draftMap.value = nextDrafts
    persistDraftMap(draftMap.value)
  }

  const removeDraftValues = (sessionIds: string[]) => {
    const nextDrafts = { ...draftMap.value }
    let changed = false

    for (const sessionId of sessionIds) {
      const key = getDraftKey(sessionId)
      if (nextDrafts[key] !== undefined) {
        delete nextDrafts[key]
        changed = true
      }
    }

    if (!changed) {
      return
    }

    draftMap.value = nextDrafts
    persistDraftMap(draftMap.value)
  }

  const applyDraftForSession = (sessionId: string | null) => {
    composer.sessionId = sessionId
    suppressDraftPersistence = true
    composer.draftText = draftMap.value[getDraftKey(sessionId)] ?? ''
    suppressDraftPersistence = false
    composer.hasDraft = composer.draftText.trim().length > 0
  }

  const restorePendingDraft = (sessionId?: string) => {
    if (!composer.pendingPrompt.trim()) {
      return
    }

    const targetSessionId = sessionId ?? (activeSessionId.value || null)
    updateDraftValue(targetSessionId, composer.pendingPrompt)
    if (composer.sessionId === targetSessionId) {
      suppressDraftPersistence = true
      composer.draftText = composer.pendingPrompt
      suppressDraftPersistence = false
      composer.hasDraft = true
    }
    composer.pendingPrompt = ''
  }

  const clearPendingDraft = (sessionId?: string | null) => {
    if (sessionId !== undefined) {
      clearDraftValue(sessionId)
    }
    composer.pendingPrompt = ''
  }

  watch(
    () => composer.draftText,
    (value) => {
      composer.hasDraft = value.trim().length > 0
      if (suppressDraftPersistence) {
        return
      }

      updateDraftValue(composer.sessionId, value)
    },
  )

  const upsertSessionSummary = (summary: SessionSummary) => {
    const next = sessions.value.filter((session) => session.id !== summary.id)
    sessions.value = [summary, ...next].sort((left, right) => right.updatedAt - left.updatedAt)
  }

  const syncSessions = (snapshot?: SessionSnapshot) => {
    if (!snapshot) {
      return
    }

    const { messages: _messages, ...summary } = snapshot
    upsertSessionSummary(summary)
  }

  const patchSessionSummary = (sessionId: string, patch: Partial<SessionSummary>) => {
    const current = sessions.value.find((session) => session.id === sessionId)
    if (!current) {
      return
    }

    upsertSessionSummary({
      ...current,
      ...patch,
    })
  }

  const syncComposerSelection = (snapshot?: SessionSnapshot | SessionSummary | null) => {
    if (!snapshot) {
      return
    }

    composer.selectedAgent = snapshot.agent || ''
    composer.selectedModel = snapshot.model || ''
    composer.selectedThinkingLevel = snapshot.thinkingLevel || ''
  }

  const resetActiveSession = () => {
    activeSessionId.value = ''
    messages.value = []
    status.value = 'idle'
    isSending.value = false
    composer.isSending = false
    composer.canAbort = false
    composer.sessionId = null
    composer.pendingPrompt = ''
    eventSource?.close()
    eventSource = null
    applyDraftForSession(null)
  }

  const refreshAgents = async (cwd?: string) => {
    agents.value = await getAgents(cwd ?? activeSession.value?.cwd ?? info.value?.workspaceDir)
    return agents.value
  }

  const refreshResources = async (options?: { cwd?: string; sessionId?: string }) => {
    resourceError.value = ''

    try {
      resources.value = await getResources({
        cwd: options?.cwd ?? activeSession.value?.cwd ?? info.value?.workspaceDir,
        sessionId: options?.sessionId ?? (activeSessionId.value || undefined),
      })
    } catch (caughtError) {
      resources.value = createEmptyResources()
      resourceError.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
    }

    return resources.value
  }

  const refreshSessions = async () => {
    const nextSessions = await getSessions()
    sessions.value = nextSessions

    if (!activeSessionId.value) {
      return nextSessions
    }

    const activeSummary = nextSessions.find((session) => session.id === activeSessionId.value)
    if (!activeSummary) {
      const fallback = nextSessions.find((session) => !session.archived) ?? null
      if (fallback) {
        await loadSession(fallback.id)
      } else {
        resetActiveSession()
        if (info.value?.workspaceDir) {
          await refreshResources({ cwd: info.value.workspaceDir })
        }
      }
      return nextSessions
    }

    status.value = activeSummary.status
    composer.canAbort = activeSummary.status === 'streaming'
    return nextSessions
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
        composer.canAbort = payload.status === 'streaming'
        patchSessionSummary(sessionId, {
          status: payload.status,
          updatedAt: Date.now(),
        })
      }

      if (payload.type === 'error' && payload.error) {
        error.value = payload.error
        status.value = 'error'
        isSending.value = false
        composer.isSending = false
        composer.canAbort = false
        patchSessionSummary(sessionId, {
          status: 'error',
          updatedAt: Date.now(),
        })
        restorePendingDraft(sessionId)
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
        composer.isSending = false
        composer.canAbort = false
        status.value = 'idle'
        clearPendingDraft(sessionId)
        patchSessionSummary(sessionId, {
          status: 'idle',
          updatedAt: Date.now(),
        })
      }
    }

    eventSource.onerror = () => {
      eventSource?.close()
      eventSource = null
    }
  }

  const loadSession = async (sessionId: string) => {
    if (composer.sessionId !== null) {
      updateDraftValue(composer.sessionId, composer.draftText)
    }

    const snapshot = await getSession(sessionId)
    activeSessionId.value = snapshot.id
    messages.value = snapshot.messages
    status.value = snapshot.status
    isSending.value = snapshot.status === 'streaming'
    composer.isSending = snapshot.status === 'streaming'
    composer.canAbort = snapshot.status === 'streaming'
    syncSessions(snapshot)
    syncComposerSelection(snapshot)
    applyDraftForSession(snapshot.id)
    await Promise.all([
      refreshAgents(snapshot.cwd),
      refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id }),
    ])
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

    await refreshAgents(systemInfo.workspaceDir)

    const firstSession = sessionList.find((session) => !session.archived) ?? sessionList[0]
    if (firstSession) {
      await loadSession(firstSession.id)
      return
    }

    applyDraftForSession(null)
    await refreshResources({ cwd: systemInfo.workspaceDir })
  }

  const createAndLoadSession = async (options?: {
    cwd?: string
    title?: string
    model?: string
    thinkingLevel?: ThinkingLevel | null
    parentSessionId?: string
    agent?: string | null
    inheritDraftFromNewSession?: boolean
  }) => {
    if (composer.sessionId !== null) {
      updateDraftValue(composer.sessionId, composer.draftText)
    }

    const snapshot = await createSession({
      cwd: options?.cwd ?? activeSession.value?.cwd ?? info.value?.workspaceDir,
      title: options?.title,
      model: options?.model ?? (composer.selectedModel || undefined),
      thinkingLevel: options?.thinkingLevel ?? (composer.selectedThinkingLevel || null),
      parentSessionId: options?.parentSessionId,
      agent: options?.agent ?? (composer.selectedAgent || null),
    })

    if (options?.inheritDraftFromNewSession) {
      moveDraftValue(null, snapshot.id)
    }

    activeSessionId.value = snapshot.id
    messages.value = snapshot.messages
    status.value = snapshot.status
    isSending.value = snapshot.status === 'streaming'
    composer.isSending = snapshot.status === 'streaming'
    composer.canAbort = snapshot.status === 'streaming'
    syncSessions(snapshot)
    syncComposerSelection(snapshot)
    applyDraftForSession(snapshot.id)
    await Promise.all([
      refreshAgents(snapshot.cwd),
      refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id }),
    ])
    connectStream(snapshot.id)
    await refreshSessions()
    return snapshot
  }

  const ensureSession = async () => {
    if (activeSessionId.value) {
      return activeSessionId.value
    }

    const snapshot = await createAndLoadSession({
      inheritDraftFromNewSession: true,
    })
    return snapshot.id
  }

  const submit = async () => {
    const prompt = composer.draftText.trim()
    if (!prompt || composer.isSending) {
      return
    }

    const resolvedModel = effectiveModel.value
    if (!resolvedModel) {
      error.value = '当前没有可用模型，无法发送'
      return
    }

    if (composer.selectedAgent && !agents.value.some((agent) => agent.name === composer.selectedAgent)) {
      error.value = `当前选择的 Agent 已不可用: ${composer.selectedAgent}`
      return
    }

    error.value = ''
    const hasExistingMessages = messages.value.length > 0
    const effectiveAgentName = effectiveAgent.value || null
    composer.pendingPrompt = prompt
    composer.isSending = true
    composer.canAbort = true
    isSending.value = true
    status.value = 'streaming'
    messages.value.push({
      id: createLocalId(),
      role: 'user',
      text: prompt,
      createdAt: Date.now(),
    })

    suppressDraftPersistence = true
    composer.draftText = ''
    composer.hasDraft = false
    suppressDraftPersistence = false

    try {
      const sessionId = await ensureSession()

      if (!hasExistingMessages) {
        patchSessionSummary(sessionId, {
          title: prompt.slice(0, 24).trim() || fallbackSessionTitle,
          updatedAt: Date.now(),
        })
      }

      await sendMessage(sessionId, {
        prompt,
        model: composer.selectedModel || undefined,
        thinkingLevel: composer.selectedThinkingLevel || undefined,
        agent: effectiveAgentName,
      })

      clearDraftValue(sessionId)
      clearDraftValue(null)
      patchSessionSummary(sessionId, {
        agent: effectiveAgentName || undefined,
        model: composer.selectedModel || undefined,
        thinkingLevel: composer.selectedThinkingLevel || undefined,
        resolvedModel,
        resolvedThinkingLevel: effectiveThinkingLevel.value,
        status: 'streaming',
        updatedAt: Date.now(),
      })
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
      status.value = 'error'
      isSending.value = false
      composer.isSending = false
      composer.canAbort = false
      restorePendingDraft(activeSessionId.value || undefined)
    }
  }

  const abort = async () => {
    if (!activeSessionId.value || !composer.isSending) {
      return
    }

    await abortSession(activeSessionId.value)
    isSending.value = false
    composer.isSending = false
    composer.canAbort = false
    status.value = 'idle'
    restorePendingDraft(activeSessionId.value)
    patchSessionSummary(activeSessionId.value, {
      status: 'idle',
      updatedAt: Date.now(),
    })
  }

  const renameSessionTitle = async (sessionId: string, title: string) => {
    const snapshot = await renameSession(sessionId, { title })
    syncSessions(snapshot)

    if (sessionId === activeSessionId.value) {
      patchSessionSummary(sessionId, { title: snapshot.title })
    }

    await refreshSessions()
  }

  const applySelectionUpdate = async (patch: {
    agent?: string | null
    model?: string | null
    thinkingLevel?: ThinkingLevel | null
  }) => {
    if (!activeSessionId.value) {
      return
    }

    const snapshot = await updateSession(activeSessionId.value, patch)
    syncSessions(snapshot)
    syncComposerSelection(snapshot)
    await refreshResources({ cwd: snapshot.cwd, sessionId: snapshot.id })
  }

  const setSelectedAgent = async (agentName: string) => {
    const nextAgent = agentName.trim()
    const previousAgent = composer.selectedAgent
    composer.selectedAgent = nextAgent

    if (!activeSessionId.value) {
      return
    }

    try {
      await applySelectionUpdate({
        agent: nextAgent || null,
      })
    } catch (caughtError) {
      composer.selectedAgent = previousAgent
      error.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
    }
  }

  const setSelectedModel = async (model: string) => {
    const nextModel = model.trim()
    const previousModel = composer.selectedModel
    composer.selectedModel = nextModel

    if (!activeSessionId.value) {
      return
    }

    try {
      await applySelectionUpdate({
        model: nextModel || null,
      })
    } catch (caughtError) {
      composer.selectedModel = previousModel
      error.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
    }
  }

  const setSelectedThinkingLevel = async (thinkingLevel: ThinkingLevel | '') => {
    const previousThinkingLevel = composer.selectedThinkingLevel
    composer.selectedThinkingLevel = thinkingLevel

    if (!activeSessionId.value) {
      return
    }

    try {
      await applySelectionUpdate({
        thinkingLevel: thinkingLevel || null,
      })
    } catch (caughtError) {
      composer.selectedThinkingLevel = previousThinkingLevel
      error.value = caughtError instanceof Error ? caughtError.message : String(caughtError)
    }
  }

  const setSessionArchived = async (sessionId: string, archived: boolean) => {
    await archiveSession(sessionId, { archived })
    await refreshSessions()
  }

  const removeSessionTree = async (sessionId: string) => {
    const response = await deleteSession(sessionId)
    removeDraftValues(response.sessionIds)
    if (response.sessionIds.includes(activeSessionId.value)) {
      resetActiveSession()
    }
    await refreshSessions()
  }

  const setComposerFocused = (focused: boolean) => {
    composer.isFocused = focused
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
    agents,
    archiveSession: setSessionArchived,
    abort,
    composer,
    createSession: createAndLoadSession,
    deleteSession: removeSessionTree,
    effectiveAgent,
    effectiveModel,
    effectiveThinkingLevel,
    error,
    info,
    isSending,
    loadSession,
    mentionedAgent,
    messages,
    models,
    refreshAgents,
    refreshResources,
    refreshSessions,
    renameSession: renameSessionTitle,
    resourceError,
    resources,
    sessions,
    setComposerFocused,
    setSelectedAgent,
    setSelectedModel,
    setSelectedThinkingLevel,
    status,
    submit,
  }
}