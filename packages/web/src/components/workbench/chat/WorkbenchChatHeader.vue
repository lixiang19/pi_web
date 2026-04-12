<script setup lang="ts">
import { CornerUpLeft } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentSummary, ChatComposerState, ThinkingLevel } from "@/lib/types";

defineProps<{
  agents: AgentSummary[];
  composer: ChatComposerState;
  currentSessionTitle: string;
  isDraftSession: boolean;
  modelOptions: Array<{ label: string; value: string }>;
  noAgentValue: string;
  parentSessionId: string;
  projectLabel: string;
  thinkingOptions: Array<{ value: ThinkingLevel; label: string }>;
}>();

const emit = defineEmits<{
  returnToParent: [];
  selectAgent: [value: unknown];
  selectModel: [value: unknown];
  selectThinking: [value: unknown];
}>();
</script>

<template>
  <div class="ridge-panel-header flex shrink-0 items-center justify-between px-4 py-3">
    <div class="flex min-w-0 items-center gap-3">
      <h2 class="truncate text-sm font-semibold text-foreground">
        {{ currentSessionTitle }}
      </h2>
      <Badge
        v-if="isDraftSession"
        variant="outline"
        class="shrink-0 text-[10px]"
      >
        Draft
      </Badge>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <Button
        v-if="parentSessionId"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 text-xs"
        @click="emit('returnToParent')"
      >
        <CornerUpLeft class="size-3.5" />
        <span class="hidden sm:inline">Back</span>
      </Button>
      <Select
        :model-value="composer.selectedModel"
        @update:model-value="emit('selectModel', $event)"
      >
        <SelectTrigger class="h-7 w-[100px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="model in modelOptions"
            :key="model.value"
            :value="model.value"
          >
            {{ model.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        :model-value="composer.selectedThinkingLevel"
        @update:model-value="emit('selectThinking', $event)"
      >
        <SelectTrigger class="h-7 w-[100px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="thinking in thinkingOptions"
            :key="thinking.value"
            :value="thinking.value"
          >
            {{ thinking.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Select
        :model-value="composer.selectedAgent || noAgentValue"
        @update:model-value="emit('selectAgent', $event)"
      >
        <SelectTrigger class="h-7 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="noAgentValue">Direct</SelectItem>
          <SelectItem
            v-for="agent in agents"
            :key="agent.name"
            :value="agent.name"
          >
            {{ agent.displayName || agent.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
