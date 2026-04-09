<script setup lang="ts">
// AiElements 重构版本
import {
  AiElementsConversation,
  AiElementsPromptInput,
} from "@/components/ai-elements";
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
  applyPrompt: [PromptCatalogItem];
  injectCommand: [string];
  injectSkill: [string];
  loadEarlier: [];
  returnToParent: [];
  selectAgent: [unknown];
  selectModel: [unknown];
  selectThinking: [unknown];
  submit: [];
  toggleResourcePicker: [];
  "update:draftText": [string];
}>();

// Map agent selection to string value
function handleAgentSelect(value: unknown) {
  emit("selectAgent", value);
}

// Map model selection to string value
function handleModelSelect(value: unknown) {
  emit("selectModel", value);
}

// Map thinking level selection to string value
function handleThinkingSelect(value: unknown) {
  emit("selectThinking", value);
}

// Handle submit from AiElementsPromptInput
function handleSubmit(text: string, options: {
  model?: string;
  thinkingLevel?: string;
  agent?: string;
}) {
  // Update draft text first
  emit("update:draftText", text);
  // Then trigger submit
  emit("submit");
}

// Handle draft text update
function handleDraftUpdate(text: string) {
  emit("update:draftText", text);
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <!-- Conversation Area -->
    <AiElementsConversation
      :messages="messages"
      :session-id="activeSessionId"
      :has-more-above="hasMoreAbove"
      :is-loading-older="isLoadingOlder"
      :is-streaming="status === 'streaming'"
      @load-earlier="emit('loadEarlier')"
    />

    <!-- Input Area -->
    <AiElementsPromptInput
      :session-id="activeSessionId"
      :disabled="!activeSessionId"
      :is-sending="isSending"
      :can-abort="composer.canAbort"
      :selected-model="composer.selectedModel"
      :selected-thinking-level="composer.selectedThinkingLevel"
      :selected-agent="composer.selectedAgent"
      :draft-text="composer.draftText"
      @submit="handleSubmit"
      @abort="emit('submit')"
      @update:draft="handleDraftUpdate"
      @update:selected-model="handleModelSelect"
      @update:selected-thinking-level="handleThinkingSelect"
      @update:selected-agent="handleAgentSelect"
    />
  </div>
</template>
