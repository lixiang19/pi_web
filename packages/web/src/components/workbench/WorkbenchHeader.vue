<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

defineProps<{
  sdkVersion?: string | undefined;
  sessionCount: number;
  shortWorkspacePath: string;
  statusLabel: string;
  statusTone: string;
}>();
</script>

<template>
  <header
    class="ridge-panel-header mb-3 flex flex-col gap-3 rounded-[28px] border border-border/40 px-4 py-4 shadow-sm sm:px-5 lg:flex-row lg:items-center lg:justify-between"
  >
    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <Badge
          class="rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary"
        >
          Platform Core
        </Badge>
        <div
          :class="
            cn(
              'rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
              statusTone,
            )
          "
        >
          {{ statusLabel }}
        </div>
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-foreground">
        Open Chamber
      </h1>
    </div>

    <div class="grid gap-2 sm:grid-cols-3 lg:min-w-[480px]">
      <div
        class="ridge-panel-inset rounded-2xl border border-border/30 px-4 py-2.5 shadow-xs transition-colors hover:bg-card"
      >
        <p
          class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          Total Sessions
        </p>
        <p class="mt-1 text-lg font-bold text-foreground">
          {{ sessionCount }}
        </p>
      </div>
      <div
        class="ridge-panel-inset rounded-2xl border border-border/30 px-4 py-2.5 shadow-xs transition-colors hover:bg-card"
      >
        <p
          class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          Active Project
        </p>
        <p
          class="mt-1 truncate font-mono text-xs font-semibold text-primary/80"
        >
          {{ shortWorkspacePath || "." }}
        </p>
      </div>
      <div
        class="ridge-panel-inset rounded-2xl border border-border/30 px-4 py-2.5 shadow-xs transition-colors hover:bg-card"
      >
        <p
          class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          SDK Version
        </p>
        <p class="mt-1 font-mono text-xs font-bold text-foreground/80">
          {{ sdkVersion || "Connecting..." }}
        </p>
      </div>
    </div>
  </header>
</template>
