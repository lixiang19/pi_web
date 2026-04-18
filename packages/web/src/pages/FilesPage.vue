<script setup lang="ts">
import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";
import { useFilesRouteState } from "@/composables/useFilesRouteState";

const { projectLabel, rootDir } = useFilesRouteState();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="ridge-panel-header flex h-14 items-center justify-between px-6">
      <div>
        <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
          Files
        </p>
        <h1 class="mt-1 text-lg font-semibold tracking-tight text-foreground">
          {{ projectLabel }}
        </h1>
      </div>
      <p class="max-w-[24rem] truncate text-xs text-muted-foreground">
        {{ rootDir || "当前没有可用目录" }}
      </p>
    </header>

    <main class="min-h-0 flex-1 overflow-hidden p-4">
      <div class="h-full overflow-hidden rounded-2xl border border-border/70 bg-card/60">
        <WorkspaceFileTree :root-dir="rootDir" />
      </div>
    </main>
  </div>
</template>
