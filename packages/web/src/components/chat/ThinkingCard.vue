<script setup lang="ts">
import { ChevronDown, ChevronUp, Brain } from "lucide-vue-next";
import { ref } from "vue";
import type { ThinkingContentBlock } from "@/lib/types";

defineProps<{
  block: ThinkingContentBlock;
}>();

const isExpanded = ref(false);

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] transition-all duration-300"
    :class="isExpanded ? 'ring-1 ring-amber-500/20' : ''"
  >
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
      @click="toggleExpand"
    >
      <div class="flex size-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
        <Brain class="size-3.5" />
      </div>
      <span class="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80">
        {{ block.redacted ? "Redacted Logic" : "Neural Processing" }}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <span class="text-[9px] font-bold uppercase tracking-widest text-stone-600">
          {{ isExpanded ? "CLOSE" : "EXPAND" }}
        </span>
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          class="size-3 text-stone-600 group-hover:text-amber-500"
        />
      </div>
    </button>

    <div v-show="isExpanded" class="border-t border-white/5 bg-black/20 px-5 py-4">
      <p v-if="block.redacted" class="text-[11px] font-medium italic text-stone-500">
        Trace redacted by core security protocol.
      </p>
      <div
        v-else
        class="whitespace-pre-wrap font-mono text-xs leading-relaxed text-amber-200/70 selection:bg-amber-500/30"
      >
        {{ block.thinking }}
      </div>
    </div>
  </div>
</template>
