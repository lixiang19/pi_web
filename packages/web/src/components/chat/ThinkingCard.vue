<script setup lang="ts">
import { computed, ref } from "vue";
import { Brain, ChevronDown } from "lucide-vue-next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ThinkingContentBlock } from "@/lib/types";

const props = defineProps<{
  block: ThinkingContentBlock;
}>();

const isExpanded = ref(false);

const summary = computed(() => {
  if (props.block.redacted) {
    return "隐藏";
  }

  const normalized = props.block.thinking.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 50) || "思考";
});
</script>

<template>
  <Collapsible v-model:open="isExpanded" class="text-muted-foreground/70">
    <CollapsibleTrigger
      class="flex w-full items-center gap-1.5 py-0.5 text-left text-xs transition-colors hover:text-foreground/80"
    >
      <Brain class="size-3.5 shrink-0" />
      <span class="truncate">思考 · {{ summary }}</span>
      <ChevronDown
        class="size-3 shrink-0 transition-transform duration-200"
        :class="isExpanded ? 'rotate-180' : ''"
      />
    </CollapsibleTrigger>

    <CollapsibleContent class="py-1">
      <div class="ridge-panel-inset rounded-md px-2 py-2">
        <p v-if="block.redacted" class="text-xs italic text-muted-foreground/60">
          已隐藏
        </p>
        <pre
          v-else
          class="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground/70"
        >{{ block.thinking }}</pre>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
