<script setup lang="ts">
import { computed, ref } from "vue";
import type { SessionSummary } from "@/lib/types";
import { Search } from "lucide-vue-next";
import WorkbenchFeatureShell from "@/components/workbench/WorkbenchFeatureShell.vue";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useWorkbenchPrimaryNavigation } from "@/composables/useWorkbenchPrimaryNavigation";

const core = usePiChatCore();
const navigation = useWorkbenchPrimaryNavigation();

const inputQuery = ref("");
const submittedQuery = ref("");

const normalizeQuery = (value: string) => value.trim().toLowerCase();

const formatUpdatedAt = (updatedAt: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(updatedAt);

const resolveSessionLocation = (session: SessionSummary) => {
  const labels = [session.projectLabel, session.worktreeLabel].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );

  if (labels.length === 0) {
    return session.cwd;
  }

  return `${labels.join(" / ")} · ${session.cwd}`;
};

const activeQuery = computed(() => normalizeQuery(submittedQuery.value));
const hasSubmittedQuery = computed(() => activeQuery.value.length > 0);

const matchedSessions = computed(() => {
  if (!hasSubmittedQuery.value) {
    return [];
  }

  return [...core.sessions.value]
    .filter((session) => normalizeQuery(session.title).includes(activeQuery.value))
    .sort((left, right) => right.updatedAt - left.updatedAt);
});

const stats = computed(() => [
  `当前已加载 ${core.sessions.value.length} 个会话，搜索范围覆盖全部会话标题。`,
  `工作区根目录：${core.info.value?.workspaceDir || "未就绪"}。`,
  hasSubmittedQuery.value
    ? `已提交搜索词“${submittedQuery.value}”，命中 ${matchedSessions.value.length} 条会话。`
    : "输入关键词后按 Enter 执行搜索，首版不会在输入时持续重算。",
]);

const submitSearch = () => {
  submittedQuery.value = inputQuery.value.trim();
};

const openSession = async (sessionId: string) => {
  await navigation.openChatSession(sessionId);
};
</script>

<template>
  <WorkbenchFeatureShell
    eyebrow="Search"
    title="统一搜索"
    description="这里是全局搜索主路由。首版先承接会话标题搜索，后续再逐步扩展到文件、命令与资源。"
    :points="stats"
  >
    <Card class="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <Search class="size-4 text-primary/70" />
          搜索会话标题
        </CardTitle>
        <CardDescription>
          通过左侧搜索入口进入本页，输入关键词后按 Enter 搜索全部会话标题。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          data-test="search-form"
          class="flex flex-col gap-3 md:flex-row"
          @submit.prevent="submitSearch"
        >
          <Input
            v-model="inputQuery"
            placeholder="输入会话标题关键词后按 Enter"
            class="h-11 flex-1"
          />
          <Button type="submit" class="h-11 px-5" :disabled="inputQuery.trim().length === 0">
            搜索
          </Button>
        </form>
      </CardContent>
    </Card>

    <Card class="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle class="text-base">会话结果</CardTitle>
        <CardDescription v-if="hasSubmittedQuery">
          标题包含“{{ submittedQuery }}”的会话会按最近更新时间排序。
        </CardDescription>
        <CardDescription v-else>
          当前还没有执行搜索。输入关键词并按 Enter 后，这里会展示匹配到的会话。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          v-if="!hasSubmittedQuery"
          data-test="search-idle"
          class="rounded-2xl border border-dashed border-border/70 bg-background/40 px-5 py-6 text-sm text-muted-foreground"
        >
          搜索只匹配会话标题；聊天系统项目、普通项目、worktree 和归档会话都会参与搜索。
        </div>

        <div
          v-else-if="matchedSessions.length === 0"
          data-test="search-empty"
          class="rounded-2xl border border-dashed border-border/70 bg-background/40 px-5 py-6 text-sm text-muted-foreground"
        >
          没有找到标题包含“{{ submittedQuery }}”的会话。
        </div>

        <div v-else class="space-y-3">
          <Button
            v-for="session in matchedSessions"
            :key="session.id"
            :data-session-id="session.id"
            data-test="search-result"
            type="button"
            variant="ghost"
            class="h-auto w-full justify-start rounded-2xl border border-border/70 bg-background/70 px-4 py-4 text-left hover:bg-accent/50"
            @click="openSession(session.id)"
          >
            <div class="flex w-full items-start justify-between gap-4">
              <div class="min-w-0 space-y-2">
                <p class="truncate text-sm font-semibold text-foreground">
                  {{ session.title }}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ resolveSessionLocation(session) }}
                </p>
              </div>

              <div class="shrink-0 text-right">
                <p class="text-[11px] font-black uppercase tracking-[0.18em] text-primary/70">
                  {{ session.archived ? "归档" : "会话" }}
                </p>
                <p class="mt-2 text-xs text-muted-foreground">
                  {{ formatUpdatedAt(session.updatedAt) }}
                </p>
              </div>
            </div>
          </Button>
        </div>
      </CardContent>
    </Card>
  </WorkbenchFeatureShell>
</template>
