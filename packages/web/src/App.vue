<script setup lang="ts">
import { computed } from 'vue'
import {
  Bot,
  FolderGit2,
  LoaderCircle,
  MonitorSmartphone,
  SendHorizontal,
  Sparkles,
  Square,
  TerminalSquare,
} from 'lucide-vue-next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { usePiChat } from '@/composables/usePiChat'
import { cn } from '@/lib/utils'

const {
  activeSession,
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
} = usePiChat()

const quickPrompts = [
  '分析当前仓库结构，并给出首页聊天布局的改进方案。',
  '根据这个项目目标，列出 Web 与桌面端首版必须具备的能力。',
  '把当前工作台拆成前端、服务端、桌面壳三部分实施计划。',
]

const statusLabel = computed(() => {
  if (status.value === 'streaming') {
    return 'Pi 正在工作'
  }

  if (status.value === 'error') {
    return '会话异常'
  }

  return '就绪'
})

const statusTone = computed(() => {
  if (status.value === 'streaming') {
    return 'bg-amber-500/15 text-amber-200 border-amber-400/30'
  }

  if (status.value === 'error') {
    return 'bg-red-500/15 text-red-200 border-red-400/30'
  }

  return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
})

const currentSessionTitle = computed(() => activeSession.value?.title || '新会话')

const applyPrompt = (prompt: string) => {
  input.value = prompt
}

const formatTime = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
}).format(timestamp)
</script>

<template>
  <div class="relative min-h-screen overflow-hidden">
    <div class="pointer-events-none absolute inset-0 bg-grid bg-[size:32px_32px] opacity-[0.045]" />
    <div class="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.2),transparent_60%)]" />

    <div class="relative mx-auto flex min-h-screen max-w-[1680px] flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:px-8 lg:py-8">
      <aside class="w-full lg:max-w-[340px] lg:flex-shrink-0">
        <div class="flex h-full flex-col gap-4">
          <Card class="border-white/10 bg-white/5 shadow-glow backdrop-blur">
            <CardHeader class="space-y-4">
              <div class="flex items-center justify-between">
                <Badge class="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-amber-100">
                  Pi Workspace
                </Badge>
                <div :class="cn('rounded-full border px-3 py-1 text-xs', statusTone)">
                  {{ statusLabel }}
                </div>
              </div>
              <div class="space-y-2">
                <CardTitle class="text-2xl tracking-tight text-stone-50">
                  跨端 Pi 对话工作台
                </CardTitle>
                <CardDescription class="text-sm leading-6 text-stone-300">
                  以 Vue、Tailwind 和 shadcn-vue 重建 openchamber 风格的多端 Pi 入口。
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent class="grid gap-3 text-sm text-stone-300">
              <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <TerminalSquare class="size-4 text-amber-300" />
                <div>
                  <p class="text-stone-50">Pi SDK</p>
                  <p class="font-mono text-xs text-stone-400">{{ info?.sdkVersion || 'loading' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <MonitorSmartphone class="size-4 text-sky-300" />
                <div>
                  <p class="text-stone-50">端形态</p>
                  <p class="text-xs text-stone-400">Web 桌面 / 移动端 / Tauri 桌面壳</p>
                </div>
              </div>
              <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <FolderGit2 class="size-4 text-emerald-300" />
                <div>
                  <p class="text-stone-50">工作目录</p>
                  <p class="line-clamp-2 font-mono text-xs text-stone-400">{{ info?.workspaceDir || '读取中...' }}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="border-white/10 bg-black/20 backdrop-blur">
            <CardHeader>
              <CardTitle class="text-base text-stone-50">会话列表</CardTitle>
              <CardDescription class="text-stone-400">
                当前运行时创建的 Pi 会话会显示在这里。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea class="h-[220px] pr-3 lg:h-[340px]">
                <div class="space-y-2">
                  <button
                    v-for="session in sessions"
                    :key="session.id"
                    type="button"
                    class="w-full rounded-2xl border px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/5"
                    :class="session.id === activeSession?.id ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/10 bg-white/[0.02]'"
                    @click="loadSession(session.id)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="truncate text-sm font-medium text-stone-100">{{ session.title }}</p>
                      <Badge variant="outline" class="border-white/10 bg-transparent text-[10px] uppercase tracking-[0.2em] text-stone-300">
                        {{ session.status }}
                      </Badge>
                    </div>
                    <p class="mt-2 truncate font-mono text-[11px] text-stone-500">{{ session.cwd }}</p>
                  </button>
                  <div v-if="sessions.length === 0" class="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-stone-400">
                    还没有会话，发送第一条消息后会自动创建。
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </aside>

      <main class="flex min-h-[70vh] flex-1 flex-col gap-4">
        <Card class="border-white/10 bg-white/5 backdrop-blur">
          <CardContent class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div class="space-y-1">
              <p class="text-xs uppercase tracking-[0.3em] text-stone-500">当前会话</p>
              <h1 class="text-2xl font-semibold tracking-tight text-stone-50">{{ currentSessionTitle }}</h1>
              <p class="text-sm text-stone-400">
                直接通过 SDK 驱动会话，后续在此扩展计划视图、工具执行和多代理流程。
              </p>
            </div>

            <div class="flex flex-col gap-3 sm:min-w-[280px]">
              <Select v-model="selectedModel">
                <SelectTrigger class="border-white/10 bg-black/30 text-stone-100">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="model in models" :key="model.value" :value="model.value">
                    {{ model.label }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <div class="flex items-center gap-2">
                <Badge variant="outline" class="border-white/10 bg-black/20 text-stone-300">
                  {{ messages.length }} 条消息
                </Badge>
                <Badge variant="outline" class="border-white/10 bg-black/20 text-stone-300">
                  {{ info?.appName || 'Pi Web' }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div class="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card class="flex min-h-[640px] flex-col border-white/10 bg-black/20 backdrop-blur">
            <CardHeader class="space-y-3 border-b border-white/10">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle class="text-lg text-stone-50">对话流</CardTitle>
                  <CardDescription class="text-stone-400">
                    Web 桌面端与移动端共用同一套会话界面。
                  </CardDescription>
                </div>
                <div class="flex items-center gap-2 text-xs text-stone-400">
                  <LoaderCircle v-if="isSending" class="size-4 animate-spin text-amber-300" />
                  <span>{{ statusLabel }}</span>
                </div>
              </div>
            </CardHeader>

            <ScrollArea class="flex-1 px-4 py-4 sm:px-6">
              <div v-if="messages.length === 0" class="flex min-h-[360px] flex-col items-center justify-center gap-6 px-4 text-center">
                <div class="rounded-full border border-amber-400/20 bg-amber-500/10 p-4 text-amber-200">
                  <Sparkles class="size-8" />
                </div>
                <div class="max-w-xl space-y-3">
                  <h2 class="text-2xl font-semibold tracking-tight text-stone-50">从 Pi 的第一条任务开始</h2>
                  <p class="text-sm leading-7 text-stone-400 sm:text-base">
                    当前首版已经打通 Vue 前端、Pi SDK 服务桥接和 Tauri 桌面壳。现在可以直接发送需求，逐步把它演进成完整工作台。
                  </p>
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
                    class="max-w-[88%] rounded-[28px] border px-4 py-3 shadow-sm sm:max-w-[75%]"
                    :class="message.role === 'user'
                      ? 'border-amber-400/25 bg-amber-500/12 text-stone-50'
                      : message.role === 'assistant'
                        ? 'border-white/10 bg-white/5 text-stone-100'
                        : 'border-sky-400/20 bg-sky-500/10 text-sky-50'"
                  >
                    <div class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-stone-400">
                      <span>{{ message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Pi' : 'System' }}</span>
                      <span class="h-1 w-1 rounded-full bg-current/40" />
                      <span>{{ formatTime(message.createdAt) }}</span>
                    </div>
                    <p class="whitespace-pre-wrap break-words text-sm leading-7 sm:text-[15px]">
                      {{ message.text || (message.pending ? '正在生成…' : '') }}
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <Separator class="bg-white/10" />

            <CardContent class="space-y-4 p-4 sm:p-6">
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="prompt in quickPrompts"
                  :key="prompt"
                  type="button"
                  class="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-stone-300 transition hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-50"
                  @click="applyPrompt(prompt)"
                >
                  {{ prompt }}
                </button>
              </div>

              <Textarea
                v-model="input"
                class="min-h-28 resize-none border-white/10 bg-black/30 text-stone-50 placeholder:text-stone-500"
                placeholder="输入你的任务，例如：为这个项目设计完整的信息架构与首页布局。"
                @keydown.enter.exact.prevent="submit"
              />

              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-xs leading-6 text-stone-500">
                  Enter 发送，Shift + Enter 换行。桌面端后续会在此接入更多工具执行与计划控制。
                </p>
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
                  <Button :disabled="!input.trim() || isSending" class="rounded-full px-5" @click="submit">
                    <SendHorizontal class="size-4" />
                    发送到 Pi
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div class="flex flex-col gap-4">
            <Card class="border-white/10 bg-black/20 backdrop-blur">
              <CardHeader>
                <CardTitle class="text-base text-stone-50">工作台目标</CardTitle>
                <CardDescription class="text-stone-400">
                  首版围绕 Pi 会话体验，而不是静态展示页。
                </CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 text-sm text-stone-300">
                <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p class="font-medium text-stone-100">1. Web 端统一体验</p>
                  <p class="mt-1 leading-6 text-stone-400">同一套界面兼容桌面浏览器和移动端。</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p class="font-medium text-stone-100">2. 桌面端可复用</p>
                  <p class="mt-1 leading-6 text-stone-400">Tauri 先复用 Web 产物，后续再引入本地 sidecar。</p>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p class="font-medium text-stone-100">3. SDK 原生接入</p>
                  <p class="mt-1 leading-6 text-stone-400">通过 `createAgentSession()` 建会话，不依赖外部 CLI 包装。</p>
                </div>
              </CardContent>
            </Card>

            <Card class="border-white/10 bg-black/20 backdrop-blur">
              <CardHeader>
                <CardTitle class="text-base text-stone-50">当前焦点</CardTitle>
                <CardDescription class="text-stone-400">
                  让首版工作流跑通，再逐步加高级能力。
                </CardDescription>
              </CardHeader>
              <CardContent class="space-y-4 text-sm text-stone-300">
                <div class="flex items-start gap-3">
                  <div class="mt-1 rounded-full border border-white/10 bg-white/5 p-2 text-amber-200">
                    <Bot class="size-4" />
                  </div>
                  <div>
                    <p class="font-medium text-stone-100">会话桥接</p>
                    <p class="mt-1 leading-6 text-stone-400">服务端已把 Pi SDK 会话封成 REST + SSE。</p>
                  </div>
                </div>
                <div class="flex items-start gap-3">
                  <div class="mt-1 rounded-full border border-white/10 bg-white/5 p-2 text-sky-200">
                    <MonitorSmartphone class="size-4" />
                  </div>
                  <div>
                    <p class="font-medium text-stone-100">响应式 UI</p>
                    <p class="mt-1 leading-6 text-stone-400">桌面双栏，移动端自然折叠为纵向流式布局。</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card v-if="error" class="border-red-400/20 bg-red-500/10 backdrop-blur">
              <CardHeader>
                <CardTitle class="text-base text-red-50">错误信息</CardTitle>
                <CardDescription class="text-red-100/80">
                  如果是模型认证问题，需要先在本机配置 Pi 支持的认证方式。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p class="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-red-100/90">
                  {{ error }}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      </div>
  </div>
</template>
