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
  autoModelValue: string;
  autoThinkingValue: string;
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
  <div class="border-b border-white/10 px-6 py-4">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <Badge
            v-if="isDraftSession"
            variant="outline"
            class="border-sky-400/20 bg-sky-500/10 text-[9px] font-bold uppercase tracking-wider text-sky-200"
          >
            Draft Session
          </Badge>
          <Badge
            variant="outline"
            class="border-white/10 bg-white/[0.03] text-[9px] font-bold uppercase tracking-wider text-stone-400"
          >
            Project: {{ projectLabel }}
          </Badge>
        </div>
        <h2 class="text-xl font-bold tracking-tight text-stone-50">
          {{ currentSessionTitle }}
        </h2>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          v-if="parentSessionId"
          variant="ghost"
          size="sm"
          class="h-8 border border-white/5 bg-white/[0.02] text-[11px] font-bold text-stone-400 hover:bg-white/[0.06] hover:text-stone-200"
          @click="emit('returnToParent')"
        >
          <CornerUpLeft class="mr-2 size-3" />
          BACK TO PARENT
        </Button>

        <Select
          :model-value="composer.selectedModel || autoModelValue"
          @update:model-value="emit('selectModel', $event)"
        >
          <SelectTrigger
            class="h-8 w-[140px] border-white/10 bg-white/[0.04] text-[11px] font-semibold text-stone-200"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="autoModelValue">
              Auto Model
            </SelectItem>
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
          :model-value="composer.selectedThinkingLevel || autoThinkingValue"
          @update:model-value="emit('selectThinking', $event)"
        >
          <SelectTrigger
            class="h-8 w-[140px] border-white/10 bg-white/[0.04] text-[11px] font-semibold text-stone-200"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="autoThinkingValue">
              Auto Thinking
            </SelectItem>
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
          <SelectTrigger
            class="h-8 w-[160px] border-white/10 bg-white/[0.04] text-[11px] font-semibold text-stone-200"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="noAgentValue">
              Direct Mode
            </SelectItem>
            <SelectItem
              v-for="agent in agents"
              :key="agent.name"
              :value="agent.name"
            >
              Agent: {{ agent.displayName || agent.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
</template>