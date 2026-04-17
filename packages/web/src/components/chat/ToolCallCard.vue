<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, Wrench } from "lucide-vue-next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { PiToolCall } from "@/lib/types";
import { getAskToolCallArguments } from "@/lib/conversation";

const props = defineProps<{
  toolCall: PiToolCall;
}>();

const isExpanded = ref(false);
const askArguments = computed(() => getAskToolCallArguments(props.toolCall));

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
  <Collapsible v-model:open="isExpanded" class="text-muted-foreground/70">
    <CollapsibleTrigger
      class="flex w-full items-center gap-1.5 py-0.5 text-left text-xs transition-colors hover:text-foreground/80"
    >
      <Wrench class="size-3.5 shrink-0" />
      <span class="truncate">工具调用 · {{ toolCall.name || "工具" }}</span>
      <ChevronDown
        class="size-3 shrink-0 transition-transform duration-200"
        :class="isExpanded ? 'rotate-180' : ''"
      />
    </CollapsibleTrigger>

    <CollapsibleContent class="py-1">
      <div class="ridge-panel-inset rounded-md px-2 py-2 text-xs leading-5 text-foreground/70">
        <template v-if="askArguments">
          <div class="space-y-3">
            <div class="space-y-1">
              <p class="text-sm font-medium text-foreground">
                {{ askArguments.title || "需要回答的问题" }}
              </p>
              <p
                v-if="askArguments.message"
                class="text-xs text-muted-foreground"
              >
                {{ askArguments.message }}
              </p>
            </div>

            <div
              v-for="question in askArguments.questions"
              :key="question.id"
              class="rounded-md border border-border/60 bg-background/70 px-3 py-2"
            >
              <p class="text-sm font-medium text-foreground">
                {{ question.question }}
              </p>
              <p
                v-if="question.description"
                class="mt-1 text-xs text-muted-foreground"
              >
                {{ question.description }}
              </p>
              <ul
                v-if="question.options?.length"
                class="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground"
              >
                <li v-for="option in question.options" :key="option.label">
                  <span class="text-foreground">{{ option.label }}</span>
                  <span v-if="option.description"> · {{ option.description }}</span>
                </li>
              </ul>
            </div>
          </div>
        </template>

        <pre
          v-else
          class="whitespace-pre-wrap break-words font-mono"
        >{{ stringifyResult(toolCall.arguments) || "{}" }}</pre>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
