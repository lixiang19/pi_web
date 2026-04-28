<script setup lang="ts">
import { Check, LoaderCircle, TextCursorInput, X } from "lucide-vue-next";
import { computed } from "vue";

import type { NoteTab } from "@/lib/types";

const props = defineProps<{
  tab: NoteTab | null;
}>();

const noteStats = computed(() => {
  if (!props.tab) return { characters: 0, lines: 0, words: 0 };
  const text = props.tab.content;
  const trimmed = text.trim();
  return {
    characters: text.length,
    lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
  };
});

const statusLabel = computed((): string => {
  if (!props.tab) return "";
  const status: string = props.tab.saveStatus;
  if (status === "saving") return "保存中";
  if (status === "unsaved") return "未保存";
  if (status === "error") return "保存失败";
  return "已保存";
});
</script>

<template>
  <footer
    v-if="tab"
    class="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-border/30 bg-muted/15 px-3 text-[11px] tabular-nums text-muted-foreground"
  >
    <div class="flex min-w-0 items-center gap-1.5">
      <TextCursorInput class="size-3 shrink-0" />
      <span class="truncate">{{ tab.relativePath }}</span>
    </div>

    <div class="flex shrink-0 items-center gap-3">
      <span>{{ noteStats.words }} 词</span>
      <span>{{ noteStats.lines }} 行</span>

      <span class="flex items-center gap-1">
        <LoaderCircle
          v-if="tab.saveStatus === 'saving'"
          class="size-3 animate-spin"
        />
        <Check
          v-else-if="tab.saveStatus === 'saved'"
          class="size-3 text-muted-foreground/60"
        />
        <X
          v-else-if="tab.saveStatus === 'error'"
          class="size-3 text-destructive"
        />
        <span
          v-else
          class="size-1.5 rounded-full bg-primary"
        />
        {{ statusLabel }}
      </span>
    </div>
  </footer>
</template>
