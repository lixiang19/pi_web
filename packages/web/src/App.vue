<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Brain,
  Command,
  SendHorizontal,
  Slash,
  Sparkles,
  Square,
} from 'lucide-vue-next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import SessionSidebar from '@/components/chat/SessionSidebar.vue'
import WorkspaceFileTree from '@/components/WorkspaceFileTree.vue'
import { usePiChat } from '@/composables/usePiChat'
import type { PromptCatalogItem, ThinkingLevel } from '@/lib/types'
import { cn } from '@/lib/utils'

const {
  activeSession,
  activeSessionId,
  agents,
  archiveSession: archiveChatSession,
  abort,
  composer,
  createSession: createChatSession,
  deleteSession: deleteChatSession,
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
  refreshResources,
  renameSession: renameChatSession,
  resourceError,
  resources,
  sessions,
  setComposerFocused,
  setSelectedAgent,
  setSelectedModel,
  setSelectedThinkingLevel,
  status,
  submit,
} = usePiChat()

const NO_AGENT_VALUE = '__pi-no-agent__'
const AUTO_MODEL_VALUE = '__pi-auto-model__'
const AUTO_THINKING_VALUE = '__pi-auto-thinking__'

const thinkingOptions: Array<{ value: ThinkingLevel; label: string }> = [
  { value: 'off', label: '关闭思考' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
]

const resourcePickerPinned = ref(false)

const statusLabel = computed(() => {
  if (status.value === 'streaming') {
    return 'Pi 正在执行'
  }

  if (status.value === 'error') {
    return '会话异常'
  }

  return '系统就绪'
})

const statusTone = computed(() => {
  if (status.value === 'streaming') {
    return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
  }

  if (status.value === 'error') {
    return 'border-red-400/30 bg-red-500/10 text-red-100'
  }

  return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
})

const currentSessionTitle = computed(() => activeSession.value?.title || '新的 Pi 会话')
const fileTreeRoot = computed(() => activeSession.value?.cwd || info.value?.workspaceDir || '')
const modelLabel = computed(() => models.value.find((item) => item.value === effectiveModel.value)?.label || effectiveModel.value || '自动')
const thinkingLabel = computed(() => thinkingOptions.find((item) => item.value === effectiveThinkingLevel.value)?.label || effectiveThinkingLevel.value)
const quickPromptChips = computed(() => resources.value.prompts.slice(0, 4))

const slashTrigger = computed(() => {
  const match = composer.draftText.match(/(^|\s)\/([\w:-]*)$/)
  if (!match) {
    return null
  }

  return {
    query: (match[2] || '').toLowerCase(),
  }
})

const resourceQuery = computed(() => slashTrigger.value?.query || '')
const isResourcePickerVisible = computed(() => resourcePickerPinned.value || Boolean(slashTrigger.value))

const matchesQuery = (value: string, description?: string) => {
  if (!resourceQuery.value) {
    return true
  }

  const haystack = `${value} ${description || ''}`.toLowerCase()
  return haystack.includes(resourceQuery.value)
}

const filteredPrompts = computed(() => resources.value.prompts.filter((item) => matchesQuery(item.name, item.description)).slice(0, 8))
const filteredSkills = computed(() => resources.value.skills.filter((item) => matchesQuery(item.name, item.description)).slice(0, 8))
const filteredCommands = computed(() => resources.value.commands.filter((item) => matchesQuery(item.name, item.description)).slice(0, 8))
const hasVisibleResources = computed(() => filteredPrompts.value.length + filteredSkills.value.length + filteredCommands.value.length > 0)

const formatProjectLabel = (cwd: string) => {
  const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) || cwd
}

const formatShortPath = (cwd: string) => {
  const normalizedWorkspace = info.value?.workspaceDir?.replace(/\\/g, '/').replace(/\/+$/, '') || ''
  const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '')

  if (normalizedWorkspace && normalized.startsWith(normalizedWorkspace)) {
    const relative = normalized.slice(normalizedWorkspace.length).replace(/^\//, '')
    return relative || '.'
  }

  return normalized
}

const replaceTrailingSlashToken = (replacement: string, options?: { trailingSpace?: boolean }) => {
  const next = composer.draftText.match(/(^|\s)\/[\w:-]*$/)
    ? composer.draftText.replace(/(^|\s)\/[\w:-]*$/, (_match, leading) => `${leading}${replacement}`)
    : composer.draftText.trim()
      ? `${composer.draftText.trim()} ${replacement}`
      : replacement

  composer.draftText = options?.trailingSpace === false ? next : `${next}${next.endsWith(' ') ? '' : ' '}`
}

const applyPrompt = (prompt: PromptCatalogItem) => {
  const content = prompt.content.trim()
  if (!content) {
    return
  }

  if (slashTrigger.value) {
    replaceTrailingSlashToken(content, { trailingSpace: false })
  } else {
    composer.draftText = composer.draftText.trim()
      ? `${composer.draftText.trim()}\n\n${content}`
      : content
  }
  resourcePickerPinned.value = false
}

const sendPromptDirectly = async (prompt: PromptCatalogItem) => {
  composer.draftText = `/${prompt.name}`
  resourcePickerPinned.value = false
  await submit()
}

const injectSkill = (invocation: string) => {
  replaceTrailingSlashToken(invocation)
  resourcePickerPinned.value = false
}

const injectCommand = (commandName: string) => {
  replaceTrailingSlashToken(`/${commandName}`)
  resourcePickerPinned.value = false
}

const toggleResourcePicker = async () => {
  resourcePickerPinned.value = !resourcePickerPinned.value
  if (resourcePickerPinned.value) {
    await refreshResources({
      cwd: activeSession.value?.cwd || info.value?.workspaceDir,
      sessionId: activeSessionId.value || undefined,
    })
  }
}

const normalizeSelectValue = (value: unknown) => (typeof value === 'string' ? value : '')

const handleAgentSelection = async (value: unknown) => {
  const nextValue = normalizeSelectValue(value)
  await setSelectedAgent(nextValue === NO_AGENT_VALUE ? '' : nextValue)
}

const handleModelSelection = async (value: unknown) => {
  const nextValue = normalizeSelectValue(value)
  await setSelectedModel(nextValue === AUTO_MODEL_VALUE ? '' : nextValue)
}

const handleThinkingSelection = async (value: unknown) => {
  const nextValue = normalizeSelectValue(value)
  await setSelectedThinkingLevel(nextValue === AUTO_THINKING_VALUE ? '' : nextValue as ThinkingLevel)
}

const createSidebarSession = async (payload: { cwd?: string; parentSessionId?: string }) => {
  await createChatSession({
    cwd: payload.cwd || activeSession.value?.cwd || info.value?.workspaceDir,
    parentSessionId: payload.parentSessionId,
    agent: composer.selectedAgent || null,
    model: composer.selectedModel || undefined,
    thinkingLevel: composer.selectedThinkingLevel || null,
  })
}

const openSession = async (sessionId: string) => {
  if (sessionId === activeSessionId.value) {
    return
  }

  await loadSession(sessionId)
}

const renameSidebarSession = async (sessionId: string, title: string) => {
  await renameChatSession(sessionId, title)
}

const archiveSidebarSession = async (sessionId: string, archived: boolean) => {
  await archiveChatSession(sessionId, archived)
}

const deleteSidebarSession = async (sessionId: string) => {
  await deleteChatSession(sessionId)
}

const formatMessageTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
}).format(timestamp)
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[#09090b] text-stone-50">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_26%),radial-gradient(circle_at_right,rgba(59,130,246,0.12),transparent_30%)]" />
    <div class="pointer-events-none absolute inset-0 bg-grid bg-[size:28px_28px] opacity-[0.04]" />

    <div class="relative mx-auto flex min-h-screen max-w-[1760px] flex-col px-3 py-3 sm:px-4 sm:py-4 xl:px-6 xl:py-5">
      <header class="mb-3 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-black/30 px-4 py-4 backdrop-blur sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <Badge class="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-amber-100">
              Pi Workspace
            </Badge>
            <div :class="cn('rounded-full border px-3 py-1 text-xs', statusTone)">
              {{ statusLabel }}
            </div>
          </div>
          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-stone-50 sm:text-[30px]">
              左侧会话，中间消息，右侧文件树
            </h1>
            <p class="max-w-3xl text-sm leading-6 text-stone-400 sm:text-[15px]">
              右侧辅助区已经删除，当前结构只保留会话列表、会话消息流和真实文件树三部分。
            </p>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
          <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-stone-500">会话数</p>
            <p class="mt-2 text-xl font-semibold text-stone-50">{{ sessions.length }}</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-stone-500">当前目录</p>
            <p class="mt-2 truncate font-mono text-xs text-stone-300">{{ formatShortPath(fileTreeRoot || '') || '.' }}</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <p class="text-[11px] uppercase tracking-[0.3em] text-stone-500">SDK</p>
            <p class="mt-2 font-mono text-sm text-stone-200">{{ info?.sdkVersion || 'loading' }}</p>
          </div>
        </div>
      </header>

      <div class="grid flex-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside class="min-h-[280px] xl:h-[calc(100vh-9.5rem)]">
          <SessionSidebar
            :sessions="sessions"
            :active-session-id="activeSessionId"
            :workspace-dir="info?.workspaceDir"
            :is-sending="isSending"
            @select="openSession"
            @create="createSidebarSession"
            @rename="renameSidebarSession"
            @archive="archiveSidebarSession"
            @remove="deleteSidebarSession"
          />
        </aside>

        <main class="min-h-[560px] xl:h-[calc(100vh-9.5rem)]">
          <div class="flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-black/35 backdrop-blur">
            <div class="border-b border-white/10 px-5 py-4">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-stone-300">
                      主会话区
                    </Badge>
                    <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-stone-300">
                      {{ formatProjectLabel(fileTreeRoot || 'workspace') }}
                    </Badge>
                  </div>
                  <div>
                    <h2 class="text-2xl font-semibold tracking-tight text-stone-50">{{ currentSessionTitle }}</h2>
                    <p class="mt-1 text-sm text-stone-400">
                      中间区域只负责会话消息流、模型切换和输入，不再承载右侧辅助信息。
                    </p>
                  </div>
                </div>

                <div class="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,180px)_minmax(0,220px)]">
                  <Select :model-value="composer.selectedModel || AUTO_MODEL_VALUE" @update:model-value="handleModelSelection">
                    <SelectTrigger class="border-white/10 bg-white/[0.04] text-stone-100">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="AUTO_MODEL_VALUE">
                        自动（{{ modelLabel }}）
                      </SelectItem>
                      <SelectItem v-for="model in models" :key="model.value" :value="model.value">
                        {{ model.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select :model-value="composer.selectedThinkingLevel || AUTO_THINKING_VALUE" @update:model-value="handleThinkingSelection">
                    <SelectTrigger class="border-white/10 bg-white/[0.04] text-stone-100">
                      <SelectValue placeholder="选择思考等级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="AUTO_THINKING_VALUE">
                        自动（{{ thinkingLabel }}）
                      </SelectItem>
                      <SelectItem v-for="thinking in thinkingOptions" :key="thinking.value" :value="thinking.value">
                        {{ thinking.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select :model-value="composer.selectedAgent || NO_AGENT_VALUE" @update:model-value="handleAgentSelection">
                    <SelectTrigger class="border-white/10 bg-white/[0.04] text-stone-100">
                      <SelectValue placeholder="选择 Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="NO_AGENT_VALUE">
                        不使用 Agent
                      </SelectItem>
                      <SelectItem v-for="agent in agents" :key="agent.name" :value="agent.name">
                        {{ agent.displayName || agent.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div class="flex flex-wrap items-center gap-2 sm:col-span-3">
                    <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-stone-300">
                      {{ effectiveAgent || '默认 Agent' }}
                    </Badge>
                    <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-stone-300">
                      {{ modelLabel }}
                    </Badge>
                    <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-stone-300">
                      {{ thinkingLabel }}
                    </Badge>
                    <Badge v-if="mentionedAgent" variant="outline" class="border-amber-400/30 bg-amber-500/10 text-amber-100">
                      文本提及 @{{ mentionedAgent }}
                    </Badge>
                    <Badge variant="outline" class="border-white/10 bg-white/[0.03] text-stone-300">
                      {{ messages.length }} 条消息
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <ScrollArea class="flex-1 px-4 py-4 sm:px-6">
              <div v-if="messages.length === 0" class="flex min-h-[360px] flex-col items-center justify-center gap-6 px-4 text-center">
                <div class="rounded-full border border-amber-400/20 bg-amber-500/10 p-4 text-amber-200">
                  <Sparkles class="size-8" />
                </div>
                <div class="max-w-2xl space-y-3">
                  <h3 class="text-2xl font-semibold tracking-tight text-stone-50">从一个任务开始</h3>
                  <p class="text-sm leading-7 text-stone-400 sm:text-base">
                    右侧现在是当前目录的真实文件树。你可以先从左边切会话，再让 Pi 结合文件结构继续推进实现。
                  </p>
                </div>
                <div class="flex flex-wrap justify-center gap-2">
                  <button
                    v-for="prompt in quickPromptChips"
                    :key="prompt.name"
                    type="button"
                    class="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-stone-300 transition hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-50"
                    @click="applyPrompt(prompt)"
                  >
                    {{ prompt.name }}
                  </button>
                </div>
              </div>

              <div v-else class="space-y-4 pb-4">
                <div
                  v-for="message in messages"
                  :key="message.id"
                  class="flex"
                  :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
                >
                  <div
                    class="max-w-[90%] rounded-[28px] border px-4 py-3 shadow-sm sm:max-w-[78%]"
                    :class="message.role === 'user'
                      ? 'border-amber-400/25 bg-amber-500/12 text-stone-50'
                      : message.role === 'assistant'
                        ? 'border-white/10 bg-white/[0.05] text-stone-100'
                        : 'border-sky-400/20 bg-sky-500/10 text-sky-50'"
                  >
                    <div class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-stone-400">
                      <span>{{ message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Pi' : 'System' }}</span>
                      <span class="h-1 w-1 rounded-full bg-current/40" />
                      <span>{{ formatMessageTime(message.createdAt) }}</span>
                    </div>
                    <p class="whitespace-pre-wrap break-words text-sm leading-7 sm:text-[15px]">
                      {{ message.text || (message.pending ? '正在生成…' : '') }}
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <Separator class="bg-white/10" />

            <div class="space-y-4 p-4 sm:p-6">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-for="prompt in quickPromptChips"
                  :key="`footer-${prompt.name}`"
                  type="button"
                  class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-left text-xs text-stone-300 transition hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-50"
                  @click="applyPrompt(prompt)"
                >
                  {{ prompt.name }}
                </button>

                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100 transition hover:bg-sky-500/20"
                  @click="toggleResourcePicker"
                >
                  <Slash class="size-3.5" />
                  资源选择器
                </button>
              </div>

              <div class="relative space-y-3">
                <div
                  v-if="isResourcePickerVisible"
                  class="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-20 overflow-hidden rounded-[24px] border border-white/10 bg-[#101014]/95 shadow-2xl backdrop-blur"
                >
                  <div class="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-stone-400">
                    <div class="flex items-center gap-2">
                      <Command class="size-3.5" />
                      <span>输入 / 调出 prompt、skill、command</span>
                    </div>
                    <span v-if="resourceQuery">过滤：{{ resourceQuery }}</span>
                  </div>

                  <ScrollArea class="max-h-[320px]">
                    <div class="space-y-4 p-3">
                      <div v-if="resourceError" class="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                        资源目录加载失败：{{ resourceError }}
                      </div>

                      <div v-if="!hasVisibleResources" class="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-stone-400">
                        当前没有匹配的资源，普通文本发送仍然可用。
                      </div>

                      <div v-if="filteredPrompts.length" class="space-y-2">
                        <div class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500">
                          <Sparkles class="size-3.5" />
                          Prompt
                        </div>
                        <div
                          v-for="prompt in filteredPrompts"
                          :key="prompt.name"
                          class="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 transition hover:border-amber-400/30 hover:bg-amber-500/10"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="space-y-1">
                              <p class="text-sm font-medium text-stone-100">{{ prompt.name }}</p>
                              <p class="text-xs leading-5 text-stone-400">{{ prompt.description || '注入模板内容到输入区' }}</p>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                              <Button
                                variant="outline"
                                class="border-white/10 bg-black/20 text-xs text-stone-200 hover:bg-black/30"
                                @click="applyPrompt(prompt)"
                              >
                                注入
                              </Button>
                              <Button
                                variant="outline"
                                class="border-white/10 bg-black/20 text-xs text-stone-200 hover:bg-black/30"
                                @click="sendPromptDirectly(prompt)"
                              >
                                直接发送
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div v-if="filteredSkills.length" class="space-y-2">
                        <div class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500">
                          <Brain class="size-3.5" />
                          Skill
                        </div>
                        <button
                          v-for="skill in filteredSkills"
                          :key="skill.name"
                          type="button"
                          class="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-sky-400/30 hover:bg-sky-500/10"
                          @click="injectSkill(skill.invocation)"
                        >
                          <p class="text-sm font-medium text-stone-100">{{ skill.name }}</p>
                          <p class="text-xs leading-5 text-stone-400">{{ skill.description || skill.invocation }}</p>
                        </button>
                      </div>

                      <div v-if="filteredCommands.length" class="space-y-2">
                        <div class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500">
                          <Command class="size-3.5" />
                          Command
                        </div>
                        <button
                          v-for="command in filteredCommands"
                          :key="command.name"
                          type="button"
                          class="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition hover:border-emerald-400/30 hover:bg-emerald-500/10"
                          @click="injectCommand(command.name)"
                        >
                          <p class="text-sm font-medium text-stone-100">/{{ command.name }}</p>
                          <p class="text-xs leading-5 text-stone-400">{{ command.description || '插入 Pi 命令调用' }}</p>
                        </button>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                <Textarea
                  v-model="composer.draftText"
                  class="min-h-32 resize-none border-white/10 bg-black/40 text-stone-50 placeholder:text-stone-500"
                  placeholder="输入任务，支持 @agent 与 / 资源选择。"
                  @focus="setComposerFocused(true)"
                  @blur="setComposerFocused(false)"
                  @keydown.enter.exact.prevent="submit"
                />
              </div>

              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="space-y-1 text-xs leading-6 text-stone-500">
                  <p>Enter 发送，Shift + Enter 换行。右侧文件树会随当前会话目录同步更新。</p>
                  <p>当前生效：{{ modelLabel }} / {{ thinkingLabel }} / {{ effectiveAgent || '默认 Agent' }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    v-if="isSending"
                    variant="outline"
                    class="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                    @click="abort"
                  >
                    <Square class="size-4" />
                    停止
                  </Button>
                  <Button :disabled="!composer.draftText.trim() || isSending || !effectiveModel" class="rounded-full px-5" @click="submit">
                    <SendHorizontal class="size-4" />
                    发送到 Pi
                  </Button>
                </div>
              </div>

              <div v-if="error" class="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3">
                <p class="text-xs leading-6 text-red-100/90">
                  {{ error }}
                </p>
              </div>

              <div v-if="resourceError" class="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3">
                <p class="text-xs leading-6 text-amber-100/90">
                  资源目录异常：{{ resourceError }}
                </p>
              </div>
            </div>
          </div>
        </main>

        <aside class="min-h-[280px] xl:h-[calc(100vh-9.5rem)]">
          <WorkspaceFileTree :root-dir="fileTreeRoot" />
        </aside>
      </div>
    </div>
  </div>
</template>