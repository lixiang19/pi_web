<script setup lang="ts">
import { FileText, X } from "lucide-vue-next";

import type { NoteTab } from "@/lib/types";

defineProps<{
  tabs: NoteTab[];
  activeTabPath: string | null;
}>();

const emit = defineEmits<{
  "select-tab": [path: string];
  "close-tab": [path: string];
}>();

function tabName(tab: NoteTab): string {
  return tab.name.replace(/\.md$/, "").replace(/\.markdown$/, "");
}
</script>

<template>
  <div class="flex h-9 shrink-0 items-end border-b border-border/40 bg-muted/30">
    <div
      v-for="tab in tabs"
      :key="tab.relativePath"
      class="group relative flex max-w-[180px] min-w-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm transition-colors"
      :class="
        activeTabPath === tab.relativePath
          ? 'border-primary bg-background text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground/80'
      "
      data-test="note-tab"
      @click="emit('select-tab', tab.relativePath)"
    >
      <FileText class="size-3.5 shrink-0" />

      <span class="truncate">{{ tabName(tab) }}</span>

      <span
        v-if="tab.saveStatus === 'unsaved' || tab.saveStatus === 'error'"
        class="size-1.5 shrink-0 rounded-full"
        :class="tab.saveStatus === 'error' ? 'bg-destructive' : 'bg-primary'"
      />

      <button
        type="button"
        class="ml-0.5 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block"
        data-test="note-tab-close"
        @click.stop="emit('close-tab', tab.relativePath)"
      >
        <X class="size-3" />
      </button>
    </div>
  </div>
</template>
