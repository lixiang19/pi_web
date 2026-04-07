<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Command,
  CornerUpLeft,
  SendHorizontal,
  Slash,
  Sparkles,
  Square,
} from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";
import SessionSidebar from "@/components/chat/SessionSidebar.vue";
import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";
import { usePiChat } from "@/composables/usePiChat";
import type { PromptCatalogItem, ThinkingLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const {
  activeDraftContext,
  activeSession,
  activeSessionId,
  agents,
  archiveSession: archiveChatSession,
  abort,
  composer,
  deleteSession: deleteChatSession,
  effectiveAgent,
  effectiveModel,
  effectiveThinkingLevel,
  error,
  hasMoreAbove,
  info,
  isSending,
  isLoadingOlder,
  loadEarlier,
  loadSession,
  mentionedAgent,
  messages,
  models,
  openSessionDraft,
  prefetchSession,
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
} = usePiChat();

const NO_AGENT_VALUE = "__pi-no-agent__";
const AUTO_MODEL_VALUE = "__pi-auto-model__";
const AUTO_THINKING_VALUE = "__pi-auto-thinking__";

const thinkingOptions: Array<{ value: ThinkingLevel; label: string }> = [
  { value: "off", label: "关闭思考" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
];

const resourcePickerPinned = ref(false);
const messageScrollArea = ref<HTMLElement | { $el?: Element } | null>(null);
const showJumpToBottom = ref(false);
const isPinnedToBottom = ref(true);

let boundMessageViewport: HTMLElement | null = null;

const statusLabel = computed(() => {
  if (status.value === "streaming") {
    return "Pi 正在执行";
  }

  if (status.value === "error") {
    return "会话异常";
  }

  return "系统就绪";
});

const statusTone = computed(() => {
  if (status.value === "streaming") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  if (status.value === "error") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
});

const isDraftSession = computed(() => !activeSession.value);
const currentSessionTitle = computed(() => {
  if (activeSession.value?.title) {
    return activeSession.value.title;
  }

  if (activeDraftContext.value?.parentSessionId) {
    return "新的分支草稿";
  }

  return "新的 Pi 会话";
});
const parentSessionId = computed(
  () =>
    activeSession.value?.parentSessionId ||
    activeDraftContext.value?.parentSessionId ||
    "",
);
const parentSessionTitle = computed(() => {
  if (!parentSessionId.value) {
    return "";
  }

  return (
    sessions.value.find((session) => session.id === parentSessionId.value)
      ?.title || "父会话"
  );
});
const fileTreeRoot = computed(
  () =>
    activeSession.value?.cwd ||
    activeDraftContext.value?.cwd ||
    info.value?.workspaceDir ||
    "",
);
const modelLabel = computed(
  () =>
    models.value.find((item) => item.value === effectiveModel.value)?.label ||
    effectiveModel.value ||
    "自动",
);
const thinkingLabel = computed(
  () =>
    thinkingOptions.find((item) => item.value === effectiveThinkingLevel.value)
      ?.label || effectiveThinkingLevel.value,
);
const quickPromptChips = computed(() => resources.value.prompts.slice(0, 4));
const sessionSidebarProps = computed(() => {
  const nextProps: {
    sessions: typeof sessions.value;
    activeSessionId: string;
    isSending: boolean;
    workspaceDir?: string;
  } = {
    sessions: sessions.value,
    activeSessionId: activeSessionId.value,
    isSending: isSending.value,
  };

  if (info.value?.workspaceDir) {
    nextProps.workspaceDir = info.value.workspaceDir;
  }

  return nextProps;
});

const slashTrigger = computed(() => {
  const match = composer.draftText.match(/(^|\s)\/([\w:-]*)$/);
  if (!match) {
    return null;
  }

  return {
    query: (match[2] || "").toLowerCase(),
  };
});

const resourceQuery = computed(() => slashTrigger.value?.query || "");
const isResourcePickerVisible = computed(
  () => resourcePickerPinned.value || Boolean(slashTrigger.value),
);

const matchesQuery = (value: string, description?: string) => {
  if (!resourceQuery.value) {
    return true;
  }

  const haystack = `${value} ${description || ""}`.toLowerCase();
  return haystack.includes(resourceQuery.value);
};

const filteredPrompts = computed(() =>
  resources.value.prompts
    .filter((item) => matchesQuery(item.name, item.description))
    .slice(0, 8),
);
const filteredSkills = computed(() =>
  resources.value.skills
    .filter((item) => matchesQuery(item.name, item.description))
    .slice(0, 8),
);
const filteredCommands = computed(() =>
  resources.value.commands
    .filter((item) => matchesQuery(item.name, item.description))
    .slice(0, 8),
);
const hasVisibleResources = computed(
  () =>
    filteredPrompts.value.length +
      filteredSkills.value.length +
      filteredCommands.value.length >
    0,
);

const formatProjectLabel = (cwd: string) => {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || cwd;
};

const formatShortPath = (cwd: string) => {
  const normalizedWorkspace =
    info.value?.workspaceDir?.replace(/\\/g, "/").replace(/\/+$/, "") || "";
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");

  if (normalizedWorkspace && normalized.startsWith(normalizedWorkspace)) {
    const relative = normalized
      .slice(normalizedWorkspace.length)
      .replace(/^\//, "");
    return relative || ".";
  }

  return normalized;
};

const replaceTrailingSlashToken = (
  replacement: string,
  options?: { trailingSpace?: boolean },
) => {
  const next = composer.draftText.match(/(^|\s)\/[\w:-]*$/)
    ? composer.draftText.replace(
        /(^|\s)\/[\w:-]*$/,
        (_match, leading) => `${leading}${replacement}`,
      )
    : composer.draftText.trim()
      ? `${composer.draftText.trim()} ${replacement}`
      : replacement;

  composer.draftText =
    options?.trailingSpace === false
      ? next
      : `${next}${next.endsWith(" ") ? "" : " "}`;
};

const applyPrompt = (prompt: PromptCatalogItem) => {
  const content = prompt.content.trim();
  if (!content) {
    return;
  }

  if (slashTrigger.value) {
    replaceTrailingSlashToken(content, { trailingSpace: false });
  } else {
    composer.draftText = composer.draftText.trim()
      ? `${composer.draftText.trim()}\n\n${content}`
      : content;
  }
  resourcePickerPinned.value = false;
};

const sendPromptDirectly = async (prompt: PromptCatalogItem) => {
  composer.draftText = `/${prompt.name}`;
  resourcePickerPinned.value = false;
  await submit();
};

const injectSkill = (invocation: string) => {
  replaceTrailingSlashToken(invocation);
  resourcePickerPinned.value = false;
};

const injectCommand = (commandName: string) => {
  replaceTrailingSlashToken(`/${commandName}`);
  resourcePickerPinned.value = false;
};

const toggleResourcePicker = async () => {
  resourcePickerPinned.value = !resourcePickerPinned.value;
  if (resourcePickerPinned.value) {
    const resourceOptions: { cwd?: string; sessionId?: string } = {};
    const resolvedCwd = fileTreeRoot.value || info.value?.workspaceDir;

    if (resolvedCwd) {
      resourceOptions.cwd = resolvedCwd;
    }

    if (activeSessionId.value) {
      resourceOptions.sessionId = activeSessionId.value;
    }

    await refreshResources(resourceOptions);
  }
};

const normalizeSelectValue = (value: unknown) =>
  typeof value === "string" ? value : "";

const handleAgentSelection = async (value: unknown) => {
  const nextValue = normalizeSelectValue(value);
  await setSelectedAgent(nextValue === NO_AGENT_VALUE ? "" : nextValue);
};

const handleModelSelection = async (value: unknown) => {
  const nextValue = normalizeSelectValue(value);
  await setSelectedModel(nextValue === AUTO_MODEL_VALUE ? "" : nextValue);
};

const handleThinkingSelection = async (value: unknown) => {
  const nextValue = normalizeSelectValue(value);
  await setSelectedThinkingLevel(
    nextValue === AUTO_THINKING_VALUE ? "" : (nextValue as ThinkingLevel),
  );
};

const createSidebarSession = async (payload: {
  cwd?: string;
  parentSessionId?: string;
}) => {
  const draftOptions: { cwd?: string; parentSessionId?: string } = {};
  const resolvedCwd =
    payload.cwd || activeSession.value?.cwd || info.value?.workspaceDir;

  if (resolvedCwd) {
    draftOptions.cwd = resolvedCwd;
  }

  if (payload.parentSessionId) {
    draftOptions.parentSessionId = payload.parentSessionId;
  }

  await openSessionDraft(draftOptions);
};

const openSession = async (sessionId: string) => {
  if (sessionId === activeSessionId.value) {
    return;
  }

  await loadSession(sessionId);
};

const returnToParentSession = async () => {
  if (!parentSessionId.value) {
    return;
  }

  await loadSession(parentSessionId.value);
};

const renameSidebarSession = async (sessionId: string, title: string) => {
  await renameChatSession(sessionId, title);
};

const archiveSidebarSession = async (sessionId: string, archived: boolean) => {
  await archiveChatSession(sessionId, archived);
};

const deleteSidebarSession = async (sessionId: string) => {
  await deleteChatSession(sessionId);
};

const resolveMessageViewport = () => {
  const host = messageScrollArea.value;
  const rootElement = host && "$el" in host ? host.$el : host;

  if (!(rootElement instanceof Element)) {
    return null;
  }

  return rootElement.querySelector(
    '[data-slot="scroll-area-viewport"]',
  ) as HTMLElement | null;
};

const syncScrollState = () => {
  const viewport = resolveMessageViewport();
  if (!viewport) {
    showJumpToBottom.value = false;
    isPinnedToBottom.value = true;
    return;
  }

  const remaining =
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  isPinnedToBottom.value = remaining <= 56;
  showJumpToBottom.value = messages.value.length > 0 && !isPinnedToBottom.value;
};

const handleViewportScroll = () => {
  syncScrollState();
};

const bindMessageViewport = async () => {
  await nextTick();

  const nextViewport = resolveMessageViewport();
  if (nextViewport === boundMessageViewport) {
    syncScrollState();
    return;
  }

  boundMessageViewport?.removeEventListener("scroll", handleViewportScroll);
  boundMessageViewport = nextViewport;
  boundMessageViewport?.addEventListener("scroll", handleViewportScroll, {
    passive: true,
  });
  syncScrollState();
};

const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
  const viewport = resolveMessageViewport();
  if (!viewport) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior,
  });
  syncScrollState();
};

const loadEarlierMessages = async () => {
  const viewport = resolveMessageViewport();
  const previousHeight = viewport?.scrollHeight ?? 0;
  const previousTop = viewport?.scrollTop ?? 0;

  await loadEarlier();
  await nextTick();

  if (viewport) {
    const heightDelta = viewport.scrollHeight - previousHeight;
    viewport.scrollTop = previousTop + heightDelta;
  }

  syncScrollState();
};

watch(
  () => activeSessionId.value,
  async () => {
    await bindMessageViewport();
    scrollToBottom("auto");
  },
);

watch(
  () => activeDraftContext.value?.parentSessionId,
  async () => {
    await bindMessageViewport();
    scrollToBottom("auto");
  },
);

watch(
  () => messages.value.length,
  async (nextLength, previousLength) => {
    await nextTick();
    if (
      nextLength > previousLength &&
      (isPinnedToBottom.value || status.value === "streaming")
    ) {
      scrollToBottom(status.value === "streaming" ? "auto" : "smooth");
      return;
    }

    syncScrollState();
  },
);

watch(
  () => messages.value.at(-1)?.text || "",
  async () => {
    await nextTick();
    if (isPinnedToBottom.value || status.value === "streaming") {
      scrollToBottom(status.value === "streaming" ? "auto" : "smooth");
      return;
    }

    syncScrollState();
  },
);

onMounted(() => {
  void bindMessageViewport();
});

onBeforeUnmount(() => {
  boundMessageViewport?.removeEventListener("scroll", handleViewportScroll);
  boundMessageViewport = null;
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[#09090b] text-stone-50">
    <div
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_26%),radial-gradient(circle_at_right,rgba(59,130,246,0.12),transparent_30%)]"
    />
    <div
      class="pointer-events-none absolute inset-0 bg-grid bg-[size:28px_28px] opacity-[0.04]"
    />

    <div
      class="relative mx-auto flex min-h-screen max-w-[1760px] flex-col px-3 py-3 sm:px-4 sm:py-4 xl:px-6 xl:py-5"
    >
      <header
        class="mb-3 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-black/30 px-4 py-4 backdrop-blur sm:px-5 lg:flex-row lg:items-center lg:justify-between"
      >
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <Badge
              class="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-amber-100"
            >
              Pi Workspace
            </Badge>
            <div
              :class="cn('rounded-full border px-3 py-1 text-xs', statusTone)"
            >
              {{ statusLabel }}
            </div>
          </div>
          <div>
            <h1
              class="text-2xl font-semibold tracking-tight text-stone-50 sm:text-[30px]"
            >
              左侧会话，中间消息，右侧文件树
            </h1>
            <p
              class="max-w-3xl text-sm leading-6 text-stone-400 sm:text-[15px]"
            >
              右侧辅助区已经删除，当前结构只保留会话列表、会话消息流和真实文件树三部分。
            </p>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
          <div
            class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
          >
            <p class="text-[11px] uppercase tracking-[0.3em] text-stone-500">
              会话数
            </p>
            <p class="mt-2 text-xl font-semibold text-stone-50">
              {{ sessions.length }}
            </p>
          </div>
          <div
            class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
          >
            <p class="text-[11px] uppercase tracking-[0.3em] text-stone-500">
              当前目录
            </p>
            <p class="mt-2 truncate font-mono text-xs text-stone-300">
              {{ formatShortPath(fileTreeRoot || "") || "." }}
            </p>
          </div>
          <div
            class="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
          >
            <p class="text-[11px] uppercase tracking-[0.3em] text-stone-500">
              SDK
            </p>
            <p class="mt-2 font-mono text-sm text-stone-200">
              {{ info?.sdkVersion || "loading" }}
            </p>
          </div>
        </div>
      </header>

      <div class="grid flex-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside class="min-h-[280px] xl:h-[calc(100vh-9.5rem)]">
          <SessionSidebar
            v-bind="sessionSidebarProps"
            @select="openSession"
            @create="createSidebarSession"
            @prefetch="prefetchSession"
            @rename="renameSidebarSession"
            @archive="archiveSidebarSession"
            @remove="deleteSidebarSession"
          />
        </aside>

        <main class="min-h-[560px] xl:h-[calc(100vh-9.5rem)]">
          <div
            class="flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-black/35 backdrop-blur"
          >
            <div class="border-b border-white/10 px-5 py-4">
              <div
                class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-white/[0.03] text-stone-300"
                    >
                      主会话区
                    </Badge>
                    <Badge
                      v-if="isDraftSession"
                      variant="outline"
                      class="border-sky-400/20 bg-sky-500/10 text-sky-100"
                    >
                      草稿态
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-white/[0.03] text-stone-300"
                    >
                      {{ formatProjectLabel(fileTreeRoot || "workspace") }}
                    </Badge>
                  </div>
                  <div>
                    <h2
                      class="text-2xl font-semibold tracking-tight text-stone-50"
                    >
                      {{ currentSessionTitle }}
                    </h2>
                    <p class="mt-1 text-sm text-stone-400">
                      {{
                        isDraftSession
                          ? "当前还没有真正创建会话，发送第一条消息时才会落盘并进入正式 session 生命周期。"
                          : "中间区域负责会话消息流、父子会话回退、模型切换和输入编排。"
                      }}
                    </p>
                  </div>
                </div>

                <div
                  class="grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,180px)_minmax(0,220px)]"
                >
                  <Button
                    v-if="parentSessionId"
                    variant="outline"
                    class="sm:col-span-3 justify-start border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/[0.08]"
                    @click="returnToParentSession"
                  >
                    <CornerUpLeft class="size-4" />
                    返回父会话 · {{ parentSessionTitle }}
                  </Button>

                  <Select
                    :model-value="composer.selectedModel || AUTO_MODEL_VALUE"
                    @update:model-value="handleModelSelection"
                  >
                    <SelectTrigger
                      class="border-white/10 bg-white/[0.04] text-stone-100"
                    >
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="AUTO_MODEL_VALUE">
                        自动（{{ modelLabel }}）
                      </SelectItem>
                      <SelectItem
                        v-for="model in models"
                        :key="model.value"
                        :value="model.value"
                      >
                        {{ model.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    :model-value="
                      composer.selectedThinkingLevel || AUTO_THINKING_VALUE
                    "
                    @update:model-value="handleThinkingSelection"
                  >
                    <SelectTrigger
                      class="border-white/10 bg-white/[0.04] text-stone-100"
                    >
                      <SelectValue placeholder="选择思考等级" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="AUTO_THINKING_VALUE">
                        自动（{{ thinkingLabel }}）
                      </SelectItem>
                      <SelectItem
                        v-for="thinking in thinkingOptions"
                        :key="thinking.value"
                        :value="thinking.value"
                      >
                        {{ thinking.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    :model-value="composer.selectedAgent || NO_AGENT_VALUE"
                    @update:model-value="handleAgentSelection"
                  >
                    <SelectTrigger
                      class="border-white/10 bg-white/[0.04] text-stone-100"
                    >
                      <SelectValue placeholder="选择 Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="NO_AGENT_VALUE">
                        不使用 Agent
                      </SelectItem>
                      <SelectItem
                        v-for="agent in agents"
                        :key="agent.name"
                        :value="agent.name"
                      >
                        {{ agent.displayName || agent.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div class="flex flex-wrap items-center gap-2 sm:col-span-3">
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-white/[0.03] text-stone-300"
                    >
                      {{ effectiveAgent || "默认 Agent" }}
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-white/[0.03] text-stone-300"
                    >
                      {{ modelLabel }}
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-white/[0.03] text-stone-300"
                    >
                      {{ thinkingLabel }}
                    </Badge>
                    <Badge
                      v-if="mentionedAgent"
                      variant="outline"
                      class="border-amber-400/30 bg-amber-500/10 text-amber-100"
                    >
                      文本提及 @{{ mentionedAgent }}
                    </Badge>
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-white/[0.03] text-stone-300"
                    >
                      {{ messages.length }} 条消息
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div class="relative flex-1 overflow-hidden">
              <ScrollArea
                ref="messageScrollArea"
                class="h-full px-4 py-4 sm:px-6"
              >
                <div
                  v-if="messages.length === 0"
                  class="flex min-h-[360px] flex-col items-center justify-center gap-6 px-4 text-center"
                >
                  <div
                    class="rounded-full border border-amber-400/20 bg-amber-500/10 p-4 text-amber-200"
                  >
                    <Sparkles class="size-8" />
                  </div>
                  <div class="max-w-2xl space-y-3">
                    <h3
                      class="text-2xl font-semibold tracking-tight text-stone-50"
                    >
                      {{
                        isDraftSession
                          ? "先写草稿，再开始执行"
                          : "从当前任务继续推进"
                      }}
                    </h3>
                    <p class="text-sm leading-7 text-stone-400 sm:text-base">
                      {{
                        isDraftSession
                          ? "这是一种正式的新会话草稿态。你可以先配置模型、Agent 和 prompt，再在第一次发送时创建真实会话。"
                          : "右侧展示的是当前目录真实文件树。你可以继续发送任务，或返回父会话重新组织上下文。"
                      }}
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
                  <div class="flex justify-center pb-2">
                    <Button
                      v-if="hasMoreAbove || isLoadingOlder"
                      variant="outline"
                      class="rounded-full border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/[0.08]"
                      :disabled="isLoadingOlder"
                      @click="loadEarlierMessages"
                    >
                      <ArrowUp class="size-4" />
                      {{
                        isLoadingOlder ? "正在加载更早消息…" : "加载更早消息"
                      }}
                    </Button>
                  </div>

                  <div
                    v-for="message in messages"
                    :key="message.id"
                    v-memo="[
                      message.id,
                      message.text,
                      message.pending,
                      message.contentBlocks.length,
                    ]"
                  >
                    <ChatMessageItem :message="message" />
                  </div>
                </div>
              </ScrollArea>

              <div
                class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4"
              >
                <Button
                  v-if="showJumpToBottom"
                  variant="outline"
                  class="pointer-events-auto rounded-full border-white/10 bg-black/70 text-stone-100 shadow-lg backdrop-blur hover:bg-black/90"
                  @click="scrollToBottom('smooth')"
                >
                  <ArrowDown class="size-4" />
                  回到底部
                </Button>
              </div>
            </div>

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
                  <div
                    class="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-stone-400"
                  >
                    <div class="flex items-center gap-2">
                      <Command class="size-3.5" />
                      <span>输入 / 调出 prompt、skill、command</span>
                    </div>
                    <span v-if="resourceQuery">过滤：{{ resourceQuery }}</span>
                  </div>

                  <ScrollArea class="max-h-[320px]">
                    <div class="space-y-4 p-3">
                      <div
                        v-if="resourceError"
                        class="rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                      >
                        资源目录加载失败：{{ resourceError }}
                      </div>

                      <div
                        v-if="!hasVisibleResources"
                        class="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-stone-400"
                      >
                        当前没有匹配的资源，普通文本发送仍然可用。
                      </div>

                      <div v-if="filteredPrompts.length" class="space-y-2">
                        <div
                          class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500"
                        >
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
                              <p class="text-sm font-medium text-stone-100">
                                {{ prompt.name }}
                              </p>
                              <p class="text-xs leading-5 text-stone-400">
                                {{
                                  prompt.description || "注入模板内容到输入区"
                                }}
                              </p>
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
                        <div
                          class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500"
                        >
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
                          <p class="text-sm font-medium text-stone-100">
                            {{ skill.name }}
                          </p>
                          <p class="text-xs leading-5 text-stone-400">
                            {{ skill.description || skill.invocation }}
                          </p>
                        </button>
                      </div>

                      <div v-if="filteredCommands.length" class="space-y-2">
                        <div
                          class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500"
                        >
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
                          <p class="text-sm font-medium text-stone-100">
                            /{{ command.name }}
                          </p>
                          <p class="text-xs leading-5 text-stone-400">
                            {{ command.description || "插入 Pi 命令调用" }}
                          </p>
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

              <div
                class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div class="space-y-1 text-xs leading-6 text-stone-500">
                  <p>
                    Enter 发送，Shift + Enter
                    换行。右侧文件树会随当前会话目录同步更新。
                  </p>
                  <p>
                    当前生效：{{ modelLabel }} / {{ thinkingLabel }} /
                    {{ effectiveAgent || "默认 Agent" }}
                  </p>
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
                  <Button
                    :disabled="
                      !composer.draftText.trim() || isSending || !effectiveModel
                    "
                    class="rounded-full px-5"
                    @click="submit"
                  >
                    <SendHorizontal class="size-4" />
                    发送到 Pi
                  </Button>
                </div>
              </div>

              <div
                v-if="error"
                class="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3"
              >
                <p class="text-xs leading-6 text-red-100/90">
                  {{ error }}
                </p>
              </div>

              <div
                v-if="resourceError"
                class="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3"
              >
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
