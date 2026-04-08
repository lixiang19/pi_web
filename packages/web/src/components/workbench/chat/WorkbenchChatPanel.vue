<script setup lang="ts">
import WorkbenchChatHeader from "@/components/workbench/chat/WorkbenchChatHeader.vue";
import WorkbenchComposer from "@/components/workbench/chat/WorkbenchComposer.vue";
import WorkbenchMessageStream from "@/components/workbench/chat/WorkbenchMessageStream.vue";
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
</script>

<template>
  <div
    class="flex h-full flex-col overflow-hidden bg-background"
  >
    <WorkbenchChatHeader
      :agents="agents"
      :auto-model-value="autoModelValue"
      :auto-thinking-value="autoThinkingValue"
      :composer="composer"
      :current-session-title="currentSessionTitle"
      :is-draft-session="isDraftSession"
      :model-options="modelOptions"
      :no-agent-value="noAgentValue"
      :parent-session-id="parentSessionId"
      :project-label="projectLabel"
      :thinking-options="thinkingOptions"
      @return-to-parent="emit('returnToParent')"
      @select-agent="emit('selectAgent', $event)"
      @select-model="emit('selectModel', $event)"
      @select-thinking="emit('selectThinking', $event)"
    />

    <WorkbenchMessageStream
      :active-draft-parent-session-id="activeDraftParentSessionId"
      :active-session-id="activeSessionId"
      :has-more-above="hasMoreAbove"
      :is-draft-session="isDraftSession"
      :is-loading-older="isLoadingOlder"
      :messages="messages"
      :status="status"
      @load-earlier="emit('loadEarlier')"
    />

    <WorkbenchComposer
      :commands="commands"
      :has-visible-resources="hasVisibleResources"
      :is-resource-picker-visible="isResourcePickerVisible"
      :is-sending="isSending"
      :prompts="prompts"
      :resource-error="resourceError"
      :skills="skills"
      :value="composer.draftText"
      @apply-prompt="emit('applyPrompt', $event)"
      @inject-command="emit('injectCommand', $event)"
      @inject-skill="emit('injectSkill', $event)"
      @submit="emit('submit')"
      @toggle-resource-picker="emit('toggleResourcePicker')"
      @update:value="emit('update:draftText', $event)"
    />
  </div>
</template>
