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
    class="mb-3 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-black/30 px-4 py-4 backdrop-blur sm:px-5 lg:flex-row lg:items-center lg:justify-between"
  >
    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <Badge
          class="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200"
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
      <h1 class="text-3xl font-bold tracking-tight text-stone-50">
        Open Chamber
      </h1>
    </div>

    <div class="grid gap-2 sm:grid-cols-3 lg:min-w-[480px]">
      <div
        class="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
      >
        <p
          class="text-[9px] font-bold uppercase tracking-widest text-stone-500"
        >
          Total Sessions
        </p>
        <p class="mt-1 text-lg font-bold text-stone-50">
          {{ sessionCount }}
        </p>
      </div>
      <div
        class="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
      >
        <p
          class="text-[9px] font-bold uppercase tracking-widest text-stone-500"
        >
          Active Project
        </p>
        <p
          class="mt-1 truncate font-mono text-xs font-semibold text-amber-400/80"
        >
          {{ shortWorkspacePath || "." }}
        </p>
      </div>
      <div
        class="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
      >
        <p
          class="text-[9px] font-bold uppercase tracking-widest text-stone-500"
        >
          SDK Version
        </p>
        <p class="mt-1 font-mono text-xs font-bold text-stone-300">
          {{ sdkVersion || "Connecting..." }}
        </p>
      </div>
    </div>
  </header>
</template>
