<script setup lang="ts">
import { computed } from "vue";
import {
	CheckSquare,
	Circle,
	CircleDot,
	FileText,
	Lightbulb,
	LoaderCircle,
	Calendar,
} from "lucide-vue-next";

import { fileIconByExtension } from "@/composables/useFileIcons";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/composables/useDashboard";
import { useWorkspaceTasks } from "@/composables/useWorkspaceTasks";
import { useWorkspaceInbox } from "@/composables/useInbox";

const props = defineProps<{
	workspaceDir: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "create-journal"): void;
	(e: "create-note"): void;
	(e: "create-inbox-note"): void;
	(e: "open-tasks-view"): void;
	(e: "open-inbox-view"): void;
}>();

const {
	recentFiles,
	isLoadingRecent,
	journalPreview,
	isLoadingJournal,
	hasTodayJournal,
	todayJournalPath,
} = useDashboard(() => props.workspaceDir);

const { todayTasks } = useWorkspaceTasks();

const { filteredFiles: inboxFiles, count: inboxCount, formatTime: formatInboxTime } = useWorkspaceInbox(() => props.workspaceDir);
const recentInboxNotes = computed(() => inboxFiles.value.slice(0, 3));

const formatDate = (timestamp: number) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);

const handleJournalAction = () => {
	if (hasTodayJournal.value) {
		emit("open-file", todayJournalPath.value);
	} else {
		emit("create-journal");
	}
};

const priorityDot = (p: string) =>
	p === "high"
		? "bg-red-500"
		: p === "low"
			? "bg-green-500"
			: "bg-amber-500";
</script>

<template>
  <div class="h-full overflow-auto p-6">
    <div class="mx-auto max-w-3xl space-y-6">
      <!-- 标题 -->
      <div>
        <h1 class="text-2xl font-bold tracking-tight">仪表盘</h1>
        <p class="mt-1 text-sm text-muted-foreground">欢迎回到工作空间</p>
      </div>

      <!-- 今日日记 -->
      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-foreground">今日日记</h2>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs"
            @click="handleJournalAction"
          >
            {{ hasTodayJournal ? "打开" : "开始写" }}
          </Button>
        </div>

        <div v-if="isLoadingJournal" class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle class="size-3.5 animate-spin" />
          加载中...
        </div>
        <button
          v-else-if="hasTodayJournal"
          type="button"
          class="mt-3 w-full cursor-default text-left text-xs text-muted-foreground whitespace-pre-line line-clamp-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/30"
          @click="handleJournalAction"
        >
          {{ journalPreview || "（空日记）" }}
        </button>
        <p v-else class="mt-3 text-xs text-muted-foreground">
          今天还没有写日记，点击「开始写」记录今天
        </p>
      </div>

      <!-- 今日待办 -->
      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-foreground">今日待办</h2>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs"
            @click="emit('open-tasks-view')"
          >
            查看全部
          </Button>
        </div>
        <div v-if="todayTasks.length === 0" class="mt-3 text-xs text-muted-foreground">
          今天没有待办
        </div>
        <div v-else class="mt-3 space-y-1">
          <div
            v-for="task in todayTasks.slice(0, 5)"
            :key="task.id"
            class="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent/30 transition-colors"
          >
            <Circle v-if="task.status === 'pending'" class="size-3 shrink-0 text-muted-foreground" />
            <CircleDot v-else class="size-3 shrink-0 text-primary" />
            <span class="min-w-0 flex-1 truncate text-xs text-foreground">{{ task.title }}</span>
            <span class="size-1.5 shrink-0 rounded-full" :class="priorityDot(task.priority)" />
          </div>
          <p v-if="todayTasks.length > 5" class="text-[10px] text-muted-foreground px-2">
            还有 {{ todayTasks.length - 5 }} 项...
          </p>
        </div>
      </div>

      <!-- 最近闪念 -->
      <div v-if="inboxCount > 0" class="rounded-lg border border-border/50 bg-card p-5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Lightbulb class="size-4 text-amber-500" />
            <h2 class="text-sm font-semibold text-foreground">最近闪念</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs"
            @click="emit('open-inbox-view')"
          >
            查看全部 ({{ inboxCount }})
          </Button>
        </div>
        <div class="mt-3 space-y-1">
          <button
            v-for="note in recentInboxNotes"
            :key="note.path"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
            @click="emit('open-file', note.path)"
          >
            <FileText class="size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="text-sm text-foreground truncate">{{ note.name.replace(/\.md$/, "") }}</p>
              <p v-if="note.preview" class="text-[11px] text-muted-foreground/70 truncate">{{ note.preview }}</p>
            </div>
            <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {{ formatInboxTime(note.modifiedAt) }}
            </span>
          </button>
        </div>
      </div>

      <!-- 最近编辑 -->
      <div class="rounded-lg border border-border/50 bg-card p-5">
        <h2 class="text-sm font-semibold text-foreground">最近编辑</h2>

        <div v-if="isLoadingRecent" class="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle class="size-3.5 animate-spin" />
          加载中...
        </div>

        <div v-else-if="recentFiles.length === 0" class="mt-3 text-xs text-muted-foreground">
          暂无文件
        </div>

        <div v-else class="mt-3 space-y-1">
          <button
            v-for="file in recentFiles"
            :key="file.path"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40"
            @click="emit('open-file', file.path)"
          >
            <component :is="fileIconByExtension(file.extension)" class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate text-sm text-foreground">{{ file.name }}</span>
            <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {{ formatDate(file.modifiedAt) }}
            </span>
          </button>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="emit('create-journal')"
        >
          <Calendar class="size-3.5" />
          新建日记
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="emit('create-note')"
        >
          <FileText class="size-3.5" />
          新建笔记
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="emit('create-inbox-note')"
        >
          <Lightbulb class="size-3.5" />
          闪念捕捉
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          @click="emit('open-tasks-view')"
        >
          <CheckSquare class="size-3.5" />
          待办
        </Button>
      </div>
    </div>
  </div>
</template>
