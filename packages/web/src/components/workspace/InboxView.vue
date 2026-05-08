<script setup lang="ts">
import { ref } from "vue";
import {
	CircleAlert,
	FileText,
	Inbox,
	Lightbulb,
	LoaderCircle,
	Search,
} from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
	type InboxMomentItem,
	useWorkspaceInbox,
} from "@/composables/useInbox";

const props = defineProps<{
	workspaceDir: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "refresh-tree"): void;
}>();

const {
	groupedItems,
	filteredItems,
	isLoading,
	error,
	searchQuery,
	count,
	captureNote,
	formatTime,
} = useWorkspaceInbox(() => props.workspaceDir);

const fleetingText = ref("");
const isSaving = ref(false);

const handleCapture = async () => {
	const text = fleetingText.value.trim();
	if (!text || !props.workspaceDir) return;

	isSaving.value = true;
	try {
		const response = await captureNote(text);
		if (!response) return;
		fleetingText.value = "";
		emit("refresh-tree");
	} catch (err) {
		console.error("Failed to capture fleeting note", err);
	} finally {
		isSaving.value = false;
	}
};

const handleInput = (event: Event) => {
	const target = event.target as HTMLTextAreaElement;
	target.style.height = "auto";
	target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
};

const handleClickItem = (item: InboxMomentItem) => {
	emit("open-file", item.path);
};
</script>

<template>
  <div class="h-full overflow-auto p-6">
    <div class="mx-auto max-w-2xl space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">收件箱</h1>
          <p class="mt-1 text-sm text-muted-foreground">快速捕捉闪念与灵感</p>
        </div>
        <Badge v-if="count > 0" variant="secondary" class="text-xs">
          {{ count }}
        </Badge>
      </div>

      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="mb-3 flex items-center gap-2">
          <Lightbulb class="size-4 text-amber-500" />
          <h2 class="text-sm font-semibold text-foreground">闪念捕捉</h2>
        </div>

        <Textarea
          v-model="fleetingText"
          placeholder="此刻的想法..."
          class="min-h-20 max-h-40 resize-none text-sm"
          @input="handleInput"
          @keydown.ctrl.enter="handleCapture"
          @keydown.meta.enter="handleCapture"
        />

        <div class="mt-3 flex items-center justify-between">
          <span class="text-[11px] text-muted-foreground">⌘ Enter 发送</span>
          <Button
            size="sm"
            class="h-7 gap-1.5 text-xs"
            :disabled="!fleetingText.trim() || isSaving"
            @click="handleCapture"
          >
            <LoaderCircle v-if="isSaving" class="size-3 animate-spin" />
            <Inbox v-else class="size-3" />
            捕捉
          </Button>
        </div>
      </div>

      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Inbox class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold text-foreground">闪念列表</h2>
          </div>

          <div v-if="count > 0" class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2">
            <Search class="size-3 text-muted-foreground" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索..."
              class="w-28 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div v-if="isLoading" class="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <LoaderCircle class="size-3.5 animate-spin" />
          加载中...
        </div>

        <div v-else-if="error" class="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <CircleAlert class="size-3.5" />
          {{ error }}
        </div>

        <div v-else-if="count === 0" class="flex flex-col items-center py-8">
          <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/40">
            <Lightbulb class="size-5 text-muted-foreground/40" />
          </div>
          <p class="text-sm text-muted-foreground">收件箱为空</p>
          <p class="mt-1 text-xs text-muted-foreground/60">写下你的第一个闪念吧</p>
        </div>

        <div v-else-if="filteredItems.length === 0 && searchQuery" class="flex flex-col items-center py-6">
          <Search class="mb-2 size-5 text-muted-foreground/40" />
          <p class="text-xs text-muted-foreground">没有匹配的闪念</p>
        </div>

        <div v-else class="space-y-4">
          <section
            v-for="group in groupedItems"
            :key="group.label"
            class="space-y-1"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-muted-foreground">{{ group.label }}</span>
              <Separator class="flex-1" />
            </div>

            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              class="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40"
              @click="handleClickItem(item)"
            >
              <FileText class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-foreground">{{ item.preview || item.content }}</p>
                <p class="mt-0.5 text-[11px] text-muted-foreground/70">{{ item.relativePath }}</p>
              </div>
              <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {{ formatTime(item) }}
              </span>
            </button>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
