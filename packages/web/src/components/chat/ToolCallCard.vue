<script setup lang="ts">
import {
  Wrench,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
} from "lucide-vue-next";
import { ref, computed } from "vue";
import type { ToolCallContentBlock, ToolResultContentBlock } from "@/lib/types";

const props = defineProps<{
  block: ToolCallContentBlock | ToolResultContentBlock;
  isResult?: boolean;
}>();

const isExpanded = ref(false);
const isToolCall = computed(() => props.block.type === "toolCall");

const toolName = computed(() => {
  if (isToolCall.value) {
    return (props.block as ToolCallContentBlock).name;
  }
  return (props.block as ToolResultContentBlock).toolName;
});

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div
    class="overflow-hidden rounded-2xl border transition-all duration-300"
    :class="[
      isResult
        ? (block as ToolResultContentBlock).isError
          ? 'border-red-500/20 bg-red-500/[0.03]'
          : 'border-emerald-500/20 bg-emerald-500/[0.03]'
        : 'border-sky-500/20 bg-sky-500/[0.03]',
      isExpanded ? 'ring-1' : '',
      isExpanded && isResult && !(block as ToolResultContentBlock).isError ? 'ring-emerald-500/20' : '',
      isExpanded && isResult && (block as ToolResultContentBlock).isError ? 'ring-red-500/20' : '',
      isExpanded && !isResult ? 'ring-sky-500/20' : ''
    ]"
  >
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
      @click="toggleExpand"
    >
      <div 
        class="flex size-7 items-center justify-center rounded-lg"
        :class="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? 'bg-red-500/10 text-red-500'
              : 'bg-emerald-500/10 text-emerald-500'
            : 'bg-sky-500/10 text-sky-500'
        "
      >
        <component
          :is="
            isResult
              ? (block as ToolResultContentBlock).isError
                ? AlertCircle
                : Check
              : Wrench
          "
          class="size-4"
        />
      </div>
      
      <div class="flex flex-col">
        <span class="text-[9px] font-black uppercase tracking-[0.2em] opacity-50">
          {{ isResult ? "Protocol Output" : "Execution Thread" }}
        </span>
        <span
          class="text-[11px] font-bold tracking-tight"
          :class="
            isResult
              ? (block as ToolResultContentBlock).isError
                ? 'text-red-400'
                : 'text-emerald-400'
              : 'text-sky-400'
          "
        >
          {{ toolName }}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <span class="text-[9px] font-bold uppercase tracking-widest text-stone-600">
          {{ isExpanded ? "CLOSE" : "EXPAND" }}
        </span>
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          class="size-3 text-stone-600"
        />
      </div>
    </button>

    <div v-show="isExpanded" class="border-t border-white/5 bg-black/40 px-5 py-4">
      <div
        class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed selection:bg-white/10"
        :class="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? 'text-red-200/70'
              : 'text-emerald-200/70'
            : 'text-sky-200/70'
        "
      >
        <template v-if="isToolCall">
          {{ JSON.stringify((block as ToolCallContentBlock).arguments, null, 2) }}
        </template>
        <template v-else>
          {{ (block as ToolResultContentBlock).content || 'No output data' }}
        </template>
      </div>
    </div>
  </div>
</template>
