<script setup lang="ts">
import { ref } from "vue";
import { ChevronDown, Sparkles } from "lucide-vue-next";

import ProcessMessageItem from "@/components/chat/ProcessMessageItem.vue";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { UiConversationMessage } from "@/lib/types";

defineProps<{
  messages: UiConversationMessage[];
}>();

const isExpanded = ref(false);
</script>

<template>
  <Collapsible v-model:open="isExpanded" class="text-muted-foreground/80">
    <CollapsibleTrigger
      class="flex w-fit max-w-full items-center gap-2 py-0.5 text-left transition-colors hover:text-foreground/90"
    >
      <Sparkles class="size-3.5 shrink-0" />
      <span class="truncate text-sm">执行过程</span>
      <ChevronDown
        class="size-3.5 shrink-0 transition-transform duration-200"
        :class="isExpanded ? 'rotate-180' : ''"
      />
    </CollapsibleTrigger>

    <CollapsibleContent class="mt-1 space-y-2 pl-5">
      <ProcessMessageItem
        v-for="message in messages"
        :key="`${message.localId || message.message.timestamp || 0}-${message.message.role}`"
        :message="message"
      />
    </CollapsibleContent>
  </Collapsible>
</template>
