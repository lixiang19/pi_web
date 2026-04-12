<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, ChevronDown, Wrench } from "lucide-vue-next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ToolCallContentBlock, ToolResultContentBlock } from "@/lib/types";

const props = defineProps<{
  block: ToolCallContentBlock | ToolResultContentBlock;
  isResult?: boolean;
}>();

const isExpanded = ref(false);
const toolCallBlock = computed(() =>
  props.block.type === "toolCall" ? props.block : null,
);
const toolResultBlock = computed(() =>
  props.block.type === "toolResult" ? props.block : null,
);

const toolName = computed(() => {
  if (toolCallBlock.value) {
    return toolCallBlock.value.name || "工具";
  }
  return toolResultBlock.value?.name || "工具";
});

const summary = computed(() => {
  if (toolCallBlock.value) {
    const keys = Object.keys(toolCallBlock.value.arguments || {});
    return keys.length ? `${keys.join(", ")}` : "";
  }

  if (!toolResultBlock.value) {
    return "";
  }

  if (typeof toolResultBlock.value.result === "string") {
    return toolResultBlock.value.result.slice(0, 50);
  }

  return toolResultBlock.value.result ? "已返回结果" : "";
});

const displayLabel = computed(() => {
  const name = toolName.value;
  const sum = summary.value;
  return sum ? `${name} · ${sum}` : name;
});

const stringifyResult = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
</script>

<template>
  <Collapsible
    v-model:open="isExpanded"
    class="text-muted-foreground/70"
  >
    <CollapsibleTrigger
      class="flex w-full items-center gap-1.5 py-0.5 text-left text-xs transition-colors hover:text-foreground/80"
    >
      <component
        :is="toolResultBlock ? Check : Wrench"
        class="size-3.5 shrink-0"
      />

      <span class="truncate">{{ displayLabel }}</span>
      <ChevronDown
        class="size-3 shrink-0 transition-transform duration-200"
        :class="isExpanded ? 'rotate-180' : ''"
      />
    </CollapsibleTrigger>

    <CollapsibleContent class="py-1">
      <div class="ridge-panel-inset rounded-md px-2 py-2 text-xs leading-5 text-foreground/70">
        <pre
          v-if="toolCallBlock"
          class="whitespace-pre-wrap break-words font-mono"
        >{{ JSON.stringify(toolCallBlock.arguments || {}, null, 2) }}</pre>

        <pre
          v-else-if="toolResultBlock"
          class="whitespace-pre-wrap break-words font-mono"
        >{{ stringifyResult(toolResultBlock.result) || '无输出' }}</pre>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
