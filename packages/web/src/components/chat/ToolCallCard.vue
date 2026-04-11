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
    class="overflow-hidden rounded-lg bg-muted/50 shadow-sm transition-all"
    :class="[
      isResult && (block as ToolResultContentBlock).isError ? 'bg-destructive/5 ring-1 ring-destructive/20' : '',
      isExpanded ? 'ring-1 ring-primary/20' : ''
    ]"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      @click="toggleExpand"
    >
      <component
        :is="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? AlertCircle
              : Check
            : Wrench
        "
        class="size-4 shrink-0"
        :class="isResult && (block as ToolResultContentBlock).isError ? 'text-destructive' : 'text-muted-foreground'"
      />
      
      <div class="flex flex-col min-w-0">
        <span class="text-xs font-medium text-foreground truncate">
          {{ toolName }}
        </span>
      </div>
      
      <div class="ml-auto">
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          class="size-4 text-muted-foreground"
        />
      </div>
    </button>

    <div v-show="isExpanded" class="ridge-panel-inset mx-2 mb-2 rounded-md px-3 py-3">
      <div class="whitespace-pre-wrap font-mono text-xs leading-5 text-foreground/70">
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
