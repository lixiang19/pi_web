<script setup lang="ts">
import {
  AiElementsConversation,
  AiElementsPromptInput,
} from "@/components/ai-elements";
import WorkbenchResourcePicker from "./WorkbenchResourcePicker.vue";
import WelcomeEmptyState from "@/components/workbench/WelcomeEmptyState.vue";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-vue-next";
import type {
  AgentSummary,
  ChatComposerState,
  ChatMessage,
  CommandCatalogItem,
  PromptCatalogItem,
  SessionSummary,
  SkillCatalogItem,
  ThinkingLevel,
} from "@/lib/types";

defineProps<{
  activeDraftParentSessionId?: string | undefined;
  activeSessionId: string;
  agents: AgentSummary[];
  autoModelValue: string;
  autoThinkingValue: string;
  commands: CommandCatalogItem[];
  composer: ChatComposerState;
  currentSessionTitle: string;
  hasMoreAbove: boolean;
  hasVisibleResources: boolean;
  isDraftSession: boolean;
  isLoadingOlder: boolean;
  isResourcePickerVisible: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  modelOptions: Array<{ label: string; value: string }>;
  noAgentValue: string;
  parentSessionId: string;
  projectLabel: string;
  prompts: PromptCatalogItem[];
  resourceError: string;
  skills: SkillCatalogItem[];
  status: SessionSummary["status"];
  thinkingOptions: Array<{ value: ThinkingLevel; label: string }>;
}>();

const emit = defineEmits<{
  applyPrompt: [item: PromptCatalogItem];
  createSession: [];
  injectCommand: [value: string];
  injectSkill: [value: string];
  loadEarlier: [];
  returnToParent: [];
  selectAgent: [value: string];
  selectModel: [value: string];
  selectThinking: [value: string];
  submit: [];
  abort: [];
  toggleResourcePicker: [];
  "update:draftText": [text: string];
}>();

function handleDraftUpdate(text: string) {
  emit("update:draftText", text);
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2 border-b bg-card/50">
      <div class="flex items-center gap-2">
        <Button
          v-if="parentSessionId"
          variant="ghost"
          size="sm"
          @click="emit('returnToParent')"
        >
          <ChevronLeft class="h-4 w-4 mr-1" />
          返回
        </Button>
        <div class="flex flex-col">
          <span class="font-medium text-sm">{{ currentSessionTitle || '新会话' }}</span>
          <span v-if="projectLabel" class="text-xs text-muted-foreground">{{ projectLabel }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span
          v-if="status === 'streaming'"
          class="flex items-center gap-1 text-xs text-primary"
        >
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          生成中...
        </span>
        <span
          v-else-if="isDraftSession"
          class="text-xs text-muted-foreground"
        >
          草稿会话
        </span>
      </div>
    </div>

    <!-- Resource Picker -->
    <WorkbenchResourcePicker
      v-if="isResourcePickerVisible"
      :commands="commands"
      :prompts="prompts"
      :skills="skills"
      :error="resourceError"
      @apply-prompt="emit('applyPrompt', $event)"
      @inject-command="emit('injectCommand', $event)"
      @inject-skill="emit('injectSkill', $event)"
    />

    <!-- Welcome State -->
    <WelcomeEmptyState
      v-if="!activeSessionId"
      class="flex-1"
      @create="emit('createSession')"
    />

    <!-- Conversation -->
    <AiElementsConversation
      v-else
      :messages="messages"
      :session-id="activeSessionId"
      :has-more-above="hasMoreAbove"
      :is-loading-older="isLoadingOlder"
      :is-streaming="status === 'streaming'"
      @load-earlier="emit('loadEarlier')"
    />

    <!-- Input -->
    <AiElementsPromptInput
      :session-id="activeSessionId"
      :disabled="!activeSessionId"
      :is-sending="isSending"
      :can-abort="composer.canAbort"
      :draft-text="composer.draftText"
      :model-options="modelOptions"
      :thinking-options="thinkingOptions"
      :agents="agents"
      :commands="commands"
      :prompts="prompts"
      :skills="skills"
      :auto-model-value="autoModelValue"
      :auto-thinking-value="autoThinkingValue"
      :no-agent-value="noAgentValue"
      :selected-model="composer.selectedModel"
      :selected-thinking-level="composer.selectedThinkingLevel"
      :selected-agent="composer.selectedAgent"
      :has-visible-resources="hasVisibleResources"
      :is-resource-picker-visible="isResourcePickerVisible"
      @submit="emit('submit')"
      @abort="emit('abort')"
      @update:draft-text="handleDraftUpdate"
      @select-model="emit('selectModel', $event)"
      @select-thinking="emit('selectThinking', $event)"
      @select-agent="emit('selectAgent', $event)"
      @toggle-resource-picker="emit('toggleResourcePicker')"
      @apply-prompt="emit('applyPrompt', $event)"
      @inject-command="emit('injectCommand', $event)"
      @inject-skill="emit('injectSkill', $event)"
    />
  </div>
</template>
