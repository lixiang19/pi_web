<script setup lang="ts">
import { ArrowRight, Cpu, FolderTree, Sparkles } from "lucide-vue-next";
import { computed } from "vue";
import { RouterLink } from "vue-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePiChat } from "@/composables/usePiChat";
import { useWorkbenchSessionState } from "@/composables/useWorkbenchSessionState";

const chat = usePiChat();
const { activeSession, activeSessionId, agents, info, sessions } = chat;
const { fileTreeRoot, formatProjectLabel, statusLabel, statusTone } =
  useWorkbenchSessionState(chat);

const activeSessionLink = computed(() =>
  activeSessionId.value ? `/sessions/${activeSessionId.value}` : "",
);
</script>

<template>
  <div class="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_420px]">
    <section class="space-y-3">
      <div
        class="rounded-[32px] border border-white/10 bg-black/35 p-6 backdrop-blur"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p
              class="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300/80"
            >
              Runtime Matrix
            </p>
            <h2 class="mt-3 text-3xl font-black tracking-tight text-stone-50">
              当前工作台运行概况
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-stone-400">
              这个页面负责汇总当前 Web
              端运行时、目录范围、会话规模和导航入口，作为后续平台设置页的统一落点。
            </p>
          </div>
          <Badge :class="statusTone">
            {{ statusLabel }}
          </Badge>
        </div>

        <div class="mt-6 grid gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p
              class="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500"
            >
              SDK
            </p>
            <p class="mt-2 font-mono text-sm font-bold text-stone-200">
              {{ info?.sdkVersion || "loading" }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p
              class="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500"
            >
              Sessions
            </p>
            <p class="mt-2 text-2xl font-black text-stone-50">
              {{ sessions.length }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p
              class="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500"
            >
              Agents
            </p>
            <p class="mt-2 text-2xl font-black text-stone-50">
              {{ agents.length }}
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <RouterLink
          to="/themes"
          class="group rounded-[28px] border border-white/10 bg-black/30 p-5 transition hover:border-amber-400/30 hover:bg-white/[0.05]"
        >
          <div class="flex items-center gap-3 text-amber-300">
            <Sparkles class="size-4" />
            <span class="text-[10px] font-black uppercase tracking-[0.24em]"
              >Theme Lab</span
            >
          </div>
          <h3 class="mt-4 text-xl font-black tracking-tight text-stone-50">
            主题与明暗模式
          </h3>
          <p class="mt-3 text-sm leading-7 text-stone-400">
            切换主题 token、预览明暗模式，并把结果持久化到浏览器本地存储。
          </p>
        </RouterLink>

        <RouterLink
          to="/"
          class="group rounded-[28px] border border-white/10 bg-black/30 p-5 transition hover:border-amber-400/30 hover:bg-white/[0.05]"
        >
          <div class="flex items-center gap-3 text-sky-300">
            <Cpu class="size-4" />
            <span class="text-[10px] font-black uppercase tracking-[0.24em]"
              >Workbench</span
            >
          </div>
          <h3 class="mt-4 text-xl font-black tracking-tight text-stone-50">
            返回主工作台
          </h3>
          <p class="mt-3 text-sm leading-7 text-stone-400">
            回到会话编排主入口，继续从左侧列表、中间会话区和右侧文件树协同工作。
          </p>
        </RouterLink>

        <div class="rounded-[28px] border border-white/10 bg-black/30 p-5">
          <div class="flex items-center gap-3 text-emerald-300">
            <FolderTree class="size-4" />
            <span class="text-[10px] font-black uppercase tracking-[0.24em]"
              >Workspace Root</span
            >
          </div>
          <h3 class="mt-4 text-xl font-black tracking-tight text-stone-50">
            {{ formatProjectLabel(fileTreeRoot || "workspace") }}
          </h3>
          <p class="mt-3 break-all font-mono text-xs leading-6 text-stone-400">
            {{ fileTreeRoot || info?.workspaceDir || "暂无可用目录" }}
          </p>
        </div>
      </div>
    </section>

    <aside class="space-y-3">
      <div
        class="rounded-[32px] border border-white/10 bg-black/35 p-6 backdrop-blur"
      >
        <p
          class="text-[10px] font-black uppercase tracking-[0.24em] text-stone-500"
        >
          Active Session
        </p>
        <h3 class="mt-3 text-2xl font-black tracking-tight text-stone-50">
          {{ activeSession?.title || "当前没有激活会话" }}
        </h3>
        <p class="mt-3 text-sm leading-7 text-stone-400">
          {{
            activeSession
              ? "你可以进入详情页检查这个会话的运行状态、消息流和目录上下文。"
              : "当前还没有激活会话，先回到工作台选择一个会话或创建新的草稿。"
          }}
        </p>

        <div
          class="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        >
          <div
            class="flex items-center justify-between gap-3 text-xs text-stone-400"
          >
            <span>Session ID</span>
            <span class="max-w-[180px] truncate font-mono text-stone-300">
              {{ activeSessionId || "-" }}
            </span>
          </div>
          <div
            class="flex items-center justify-between gap-3 text-xs text-stone-400"
          >
            <span>Project</span>
            <span class="font-semibold text-stone-200">
              {{ formatProjectLabel(fileTreeRoot || "workspace") }}
            </span>
          </div>
        </div>

        <Button
          v-if="activeSessionLink"
          as-child
          class="mt-6 w-full rounded-2xl bg-amber-500 text-black hover:bg-amber-400"
        >
          <RouterLink :to="activeSessionLink">
            查看当前会话详情
            <ArrowRight class="ml-2 size-4" />
          </RouterLink>
        </Button>
      </div>
    </aside>
  </div>
</template>
