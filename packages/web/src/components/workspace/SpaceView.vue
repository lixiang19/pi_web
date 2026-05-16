<script setup lang="ts">
import {
	ArrowUpRight,
	FileCode2,
	LoaderCircle,
	RefreshCw,
	ShieldCheck,
} from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SpaceWorkItem } from "@/lib/types";

defineProps<{
	works: SpaceWorkItem[];
	loading: boolean;
	error: string;
}>();

const emit = defineEmits<{
	(e: "open-preview", work: SpaceWorkItem): void;
	(e: "refresh"): void;
}>();

const formatUpdatedAt = (value: number) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));

const formatSize = (value: number) => {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / 1024 / 1024).toFixed(1)} MB`;
};
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
      <div class="flex min-w-0 items-center gap-2">
        <FileCode2 class="size-4 text-muted-foreground" />
        <span class="text-sm font-semibold text-foreground">空间</span>
        <Badge variant="secondary" class="text-micro">{{ works.length }}</Badge>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        class="size-8"
        title="刷新空间作品"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-4" />
      </Button>
    </header>

    <div v-if="loading" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle class="size-4 animate-spin" />
      加载空间作品...
    </div>

    <div v-else-if="error" class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-sm font-medium text-foreground">空间作品加载失败</p>
      <p class="max-w-lg text-xs text-muted-foreground">{{ error }}</p>
      <Button type="button" variant="outline" size="sm" @click="emit('refresh')">
        <RefreshCw class="mr-2 size-3.5" />
        重试
      </Button>
    </div>

    <div v-else-if="works.length === 0" class="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <FileCode2 class="size-9 text-muted-foreground/50" />
      <p class="text-sm font-medium text-foreground">还没有空间作品</p>
      <p class="max-w-lg text-xs leading-6 text-muted-foreground">
        保存到 空间/&lt;作品名&gt;/index.html 后会出现在这里。
      </p>
    </div>

    <ScrollArea v-else class="flex-1">
      <div class="divide-y divide-border/40">
        <button
          v-for="work in works"
          :key="work.id"
          type="button"
          data-test="space-work-row"
          class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="emit('open-preview', work)"
        >
          <FileCode2 class="size-4 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-foreground">{{ work.name }}</div>
            <div class="mt-0.5 truncate text-caption text-muted-foreground">{{ work.indexPath }}</div>
          </div>
          <div class="hidden shrink-0 items-center gap-2 text-caption text-muted-foreground md:flex">
            <span>{{ formatSize(work.size) }}</span>
            <span>{{ formatUpdatedAt(work.modifiedAt) }}</span>
          </div>
          <Badge variant="outline" class="hidden shrink-0 gap-1 text-micro sm:inline-flex">
            <ShieldCheck class="size-3" />
            私有
          </Badge>
          <ArrowUpRight class="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
