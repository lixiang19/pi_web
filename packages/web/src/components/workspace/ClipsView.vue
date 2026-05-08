<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Bookmark, ExternalLink, LoaderCircle, Search } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { getClips, type ClipRecord } from "@/lib/api";

const clips = ref<ClipRecord[]>([]);
const isLoading = ref(false);
const error = ref("");
const searchQuery = ref("");

const filteredClips = computed(() => {
	const q = searchQuery.value.trim().toLowerCase();
	if (!q) return clips.value;
	return clips.value.filter((clip) => {
		return (
			clip.title.toLowerCase().includes(q) ||
			clip.content.toLowerCase().includes(q) ||
			(clip.url ?? "").toLowerCase().includes(q) ||
			(clip.source ?? "").toLowerCase().includes(q)
		);
	});
});

const load = async () => {
	isLoading.value = true;
	error.value = "";
	try {
		const res = await getClips();
		clips.value = res.clips;
	} catch (err) {
		error.value = err instanceof Error ? err.message : String(err);
		clips.value = [];
	} finally {
		isLoading.value = false;
	}
};

const formatDate = (timestamp: number) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);

onMounted(load);
</script>

<template>
  <div class="h-full overflow-auto p-6">
    <div class="mx-auto max-w-3xl space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">剪藏</h1>
          <p class="mt-1 text-sm text-muted-foreground">从闪念沉淀的链接、摘录和资料</p>
        </div>
        <Badge v-if="clips.length > 0" variant="secondary">{{ clips.length }}</Badge>
      </div>

      <div class="flex h-9 items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3">
        <Search class="size-4 text-muted-foreground" />
        <input v-model="searchQuery" type="text" placeholder="搜索标题、链接、正文..." class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50" />
      </div>

      <div v-if="isLoading" class="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        加载中...
      </div>

      <div v-else-if="error" class="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {{ error }}
      </div>

      <div v-else-if="clips.length === 0" class="flex flex-col items-center rounded-lg border border-border/50 bg-card py-12">
        <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/40">
          <Bookmark class="size-5 text-muted-foreground/40" />
        </div>
        <p class="text-sm text-muted-foreground">还没有剪藏</p>
        <p class="mt-1 text-xs text-muted-foreground/60">可以从闪念处理为剪藏</p>
      </div>

      <div v-else-if="filteredClips.length === 0" class="rounded-lg border border-border/50 bg-card py-8 text-center text-sm text-muted-foreground">
        没有匹配的剪藏
      </div>

      <div v-else class="space-y-3">
        <article v-for="clip in filteredClips" :key="clip.id" class="rounded-lg border border-border/50 bg-card p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-sm font-semibold text-foreground">{{ clip.title }}</h2>
              <a v-if="clip.url" :href="clip.url" target="_blank" rel="noreferrer" class="mt-1 flex items-center gap-1 truncate text-xs text-primary hover:underline">
                <ExternalLink class="size-3" />
                {{ clip.url }}
              </a>
            </div>
            <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">{{ formatDate(clip.createdAt) }}</span>
          </div>
          <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{{ clip.content }}</p>
          <p v-if="clip.source" class="mt-3 text-[11px] text-muted-foreground/70">来源：{{ clip.source }}</p>
        </article>
      </div>
    </div>
  </div>
</template>
