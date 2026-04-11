<script setup lang="ts">
import { FolderKanban } from "lucide-vue-next";

import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";


defineProps<{
  projectLabel: string;
  rootDir: string;
}>();
</script>

<template>
  <div
    class="flex flex-1 flex-col overflow-hidden"
  >
    <div class="ridge-panel-header flex h-12 items-center justify-between px-4">
      <div class="flex items-center gap-2">
        <FolderKanban class="size-3.5 text-foreground/40" />
        <h3 class="text-[10px] font-black uppercase tracking-widest text-foreground/60">
          Project Files
        </h3>
      </div>
      <span class="text-[9px] font-black uppercase opacity-30 tabular-nums">
        {{ projectLabel }}
      </span>
    </div>
    <div class="flex-1 overflow-auto p-4 scrollbar-thin">
      <WorkspaceFileTree :root-dir="rootDir" />
    </div>
  </div>
</template>