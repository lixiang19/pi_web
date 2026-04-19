<script setup lang="ts">
import { computed, ref } from "vue";
import { Search } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useWorkbenchPrimaryNavigation } from "@/composables/useWorkbenchPrimaryNavigation";

const core = usePiChatCore();
const navigation = useWorkbenchPrimaryNavigation();

const inputQuery = ref("");
const submittedQuery = ref("");

const normalize = (value: string) => value.trim().toLowerCase();

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const highlightKeyword = (text: string, query: string): string => {
  const normalizedText = text.toLowerCase();
  const idx = normalizedText.indexOf(query);
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, idx)) +
    `<mark class="bg-primary/20 text-primary rounded-[2px] px-0.5 not-italic">${escapeHtml(text.slice(idx, idx + query.length))}</mark>` +
    escapeHtml(text.slice(idx + query.length))
  );
};

const formatDate = (updatedAt: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(updatedAt);

const activeQuery = computed(() => normalize(submittedQuery.value));
const hasSearched = computed(() => activeQuery.value.length > 0);

const results = computed(() => {
  if (!hasSearched.value) return [];
  return [...core.sessions.value]
    .filter((s) => normalize(s.title).includes(activeQuery.value))
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

const submitSearch = () => {
  submittedQuery.value = inputQuery.value.trim();
};

const openSession = async (sessionId: string) => {
  await navigation.openChatSession(sessionId);
};
</script>

<template>
  <div class="flex h-full flex-col overflow-auto">
    <!-- 搜索框区域 -->
    <div class="mx-auto w-full max-w-2xl px-6 pt-16 pb-8">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">搜索会话</h1>
        <p class="mt-1.5 text-sm text-muted-foreground">输入关键词，按 Enter 搜索全部会话标题</p>
      </div>

      <form class="flex gap-2" @submit.prevent="submitSearch">
        <div class="relative flex-1">
          <Search class="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            v-model="inputQuery"
            placeholder="输入会话标题关键词…"
            class="h-11 pl-10 text-sm"
            autofocus
          />
        </div>
        <Button
          type="submit"
          class="h-11 px-5"
          :disabled="inputQuery.trim().length === 0"
        >
          搜索
        </Button>
      </form>
    </div>

    <!-- 结果区域 -->
    <div class="mx-auto w-full max-w-2xl flex-1 px-6 pb-10">
      <!-- 空态 -->
      <div
        v-if="!hasSearched"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
          <Search class="size-6 text-muted-foreground/50" />
        </div>
        <p class="text-sm font-medium text-muted-foreground">搜索你的所有会话</p>
        <p class="mt-1 text-xs text-muted-foreground/60">支持聊天会话、归档会话，全部会话标题均参与搜索</p>
      </div>

      <!-- 无结果 -->
      <div
        v-else-if="results.length === 0"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
          <Search class="size-6 text-muted-foreground/40" />
        </div>
        <p class="text-sm font-medium text-foreground">
          没有找到
          <span class="text-primary">"{{ submittedQuery }}"</span>
          相关的会话
        </p>
        <p class="mt-1 text-xs text-muted-foreground/60">换一个关键词，或检查会话是否已归档</p>
      </div>

      <!-- 有结果 -->
      <template v-else>
        <p class="mb-4 text-xs text-muted-foreground">
          共找到 <span class="font-semibold text-foreground">{{ results.length }}</span> 条匹配
          <span class="text-primary">"{{ submittedQuery }}"</span> 的会话
        </p>

        <div class="divide-y divide-border/50 rounded-xl border border-border/60 bg-card/60 overflow-hidden">
          <button
            v-for="session in results"
            :key="session.id"
            type="button"
            class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            @click="openSession(session.id)"
          >
            <!-- 标题 + 位置 -->
            <div class="min-w-0 flex-1 space-y-1">
              <p
                class="truncate text-sm font-medium text-foreground"
                v-html="highlightKeyword(session.title, activeQuery)"
              />
              <p class="truncate text-xs text-muted-foreground/70">
                {{ [session.projectLabel, session.worktreeLabel].filter(Boolean).join(' / ') || session.cwd }}
              </p>
            </div>

            <!-- 类型 + 时间 -->
            <div class="shrink-0 text-right">
              <span
                class="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                :class="session.archived
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'"
              >
                {{ session.archived ? '归档' : '会话' }}
              </span>
              <p class="mt-1.5 text-[11px] text-muted-foreground/60">{{ formatDate(session.updatedAt) }}</p>
            </div>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
