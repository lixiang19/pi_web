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
    class="overflow-hidden rounded-lg bg-muted/50 shadow-sm transition-all"
    :class="isExpanded ? 'ring-1 ring-primary/20' : ''"
  >
    <button
      type="button"
      class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
      @click="toggleExpand"
    >
      <Brain class="size-4 text-muted-foreground" />
      <span class="text-xs text-muted-foreground">
        {{ block.redacted ? "Redacted Logic" : "Neural Processing" }}
      </span>
      <div class="ml-auto">
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          class="size-4 text-muted-foreground"
        />
      </div>
    </button>

    <div v-show="isExpanded" class="ridge-panel-inset mx-2 mb-2 rounded-md px-3 py-3">
      <p v-if="block.redacted" class="text-xs italic text-muted-foreground">
        Content redacted
      </p>
      <div
        v-else
        class="whitespace-pre-wrap font-mono text-xs leading-5 text-foreground/70"
      >
        {{ block.thinking }}
      </div>
    </div>
  </div>
</template>
