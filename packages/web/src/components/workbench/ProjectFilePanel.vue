<script setup lang="ts">
import { FolderKanban } from "lucide-vue-next";

import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";
import { Badge } from "@/components/ui/badge";

defineProps<{
  projectLabel: string;
  rootDir: string;
}>();
</script>

<template>
  <div
    class="flex flex-1 flex-col overflow-hidden rounded-[32px] border border-white/10 bg-black/35 backdrop-blur"
  >
    <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
      <div class="flex items-center gap-2">
        <FolderKanban class="size-4 text-amber-400" />
        <h3 class="text-sm font-semibold tracking-tight text-stone-50">
          项目文件树
        </h3>
      </div>
      <Badge variant="outline" class="border-white/10 bg-white/5 text-[10px]">
        {{ projectLabel }}
      </Badge>
    </div>
    <div class="flex-1 overflow-auto p-4">
      <WorkspaceFileTree :root-dir="rootDir" />
    </div>
  </div>
</template>