<script setup lang="ts">
import {
  ArrowLeft,
  Binary,
  FolderTree,
  GitBranch,
  MessageSquareText,
} from "lucide-vue-next";
import { computed, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";

import ProjectFilePanel from "@/components/workbench/ProjectFilePanel.vue";
import WorkbenchMessageStream from "@/components/workbench/chat/WorkbenchMessageStream.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePiChat } from "@/composables/usePiChat";
import { useWorkbenchSessionState } from "@/composables/useWorkbenchSessionState";

const route = useRoute();
const chat = usePiChat();
const {
  activeSession,
  activeSessionId,
  hasMoreAbove,
  isLoadingOlder,
  loadEarlier,
  loadSession,
  messages,
  status,
} = chat;
const { fileTreeRoot, formatProjectLabel } = useWorkbenchSessionState(chat);

const sessionId = computed(() => String(route.params["sessionId"] || ""));

watch(
  sessionId,
  async (nextSessionId) => {
    if (!nextSessionId) {
      return;
    }

    await loadSession(nextSessionId);
  },
  { immediate: true },
);
</script>

<template>
  <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
    <main class="space-y-3">
      <section
        class="rounded-[32px] border border-white/10 bg-black/35 p-6 backdrop-blur"
      >
        <div
          class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
        >
          <div>
            <p
              class="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300/80"
            >
              Session Detail
            </p>
            <h2 class="mt-3 text-3xl font-black tracking-tight text-stone-50">
              {{ activeSession?.title || "正在加载会话" }}
            </h2>
            <p class="mt-3 max-w-3xl text-sm leading-7 text-stone-400">
              详情页只聚焦当前会话的上下文、消息流和目录根，不再混入左侧多会话导航，适合查看单个会话的执行轨迹。
            </p>
          </div>

          <Button
            as-child
            variant="outline"
            class="rounded-2xl border-white/10 bg-white/[0.03] text-stone-200 hover:bg-white/[0.06]"
          >
            <RouterLink to="/">
              <ArrowLeft class="mr-2 size-4" />
              返回工作台
            </RouterLink>
          </Button>
        </div>

        <div class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="flex items-center gap-2 text-stone-400">
              <Binary class="size-4" />
              <span class="text-[10px] font-black uppercase tracking-[0.2em]"
                >Session ID</span
              >
            </div>
            <p class="mt-3 truncate font-mono text-xs text-stone-200">
              {{ activeSession?.id || sessionId }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="flex items-center gap-2 text-stone-400">
              <FolderTree class="size-4" />
              <span class="text-[10px] font-black uppercase tracking-[0.2em]"
                >Project</span
              >
            </div>
            <p class="mt-3 text-sm font-bold text-stone-100">
              {{ formatProjectLabel(fileTreeRoot || "workspace") }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="flex items-center gap-2 text-stone-400">
              <GitBranch class="size-4" />
              <span class="text-[10px] font-black uppercase tracking-[0.2em]"
                >Branch</span
              >
            </div>
            <p class="mt-3 text-sm font-bold text-stone-100">
              {{ activeSession?.branch || "unknown" }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="flex items-center gap-2 text-stone-400">
              <MessageSquareText class="size-4" />
              <span class="text-[10px] font-black uppercase tracking-[0.2em]"
                >Messages</span
              >
            </div>
            <p class="mt-3 text-2xl font-black text-stone-50">
              {{ messages.length }}
            </p>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            class="border-white/10 bg-white/[0.03] text-stone-300"
          >
            Status: {{ status }}
          </Badge>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/[0.03] text-stone-300"
          >
            Agent: {{ activeSession?.agent || "default" }}
          </Badge>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/[0.03] text-stone-300"
          >
            Model:
            {{ activeSession?.resolvedModel || activeSession?.model || "auto" }}
          </Badge>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/[0.03] text-stone-300"
          >
            Thinking:
            {{
              activeSession?.resolvedThinkingLevel ||
              activeSession?.thinkingLevel ||
              "auto"
            }}
          </Badge>
        </div>
      </section>

      <section class="min-h-[560px] xl:h-[calc(100vh-23rem)]">
        <div
          class="flex h-full flex-col overflow-hidden rounded-[32px] border border-white/10 bg-black/35 backdrop-blur"
        >
          <WorkbenchMessageStream
            :active-session-id="activeSessionId"
            :has-more-above="hasMoreAbove"
            :is-draft-session="false"
            :is-loading-older="isLoadingOlder"
            :messages="messages"
            :status="status"
            @load-earlier="loadEarlier"
          />
        </div>
      </section>
    </main>

    <aside class="flex min-h-[400px] flex-col gap-3 xl:h-[calc(100vh-9.5rem)]">
      <ProjectFilePanel
        :project-label="formatProjectLabel(fileTreeRoot)"
        :root-dir="fileTreeRoot"
      />
    </aside>
  </div>
</template>
