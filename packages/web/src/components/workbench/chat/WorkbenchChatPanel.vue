<script setup lang="ts">
import WelcomeEmptyState from "@/components/workbench/WelcomeEmptyState.vue";
import WorkbenchComposer from "./WorkbenchComposer.vue";
import WorkbenchMessageStream from "./WorkbenchMessageStream.vue";
import type {
  AgentSummary,
  AskInteractiveRequest,
  AskQuestionAnswer,
  PermissionInteractiveRequest,
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
  commands: CommandCatalogItem[];
  composer: ChatComposerState;
  hasMoreAbove: boolean;
  interactiveRequests: AskInteractiveRequest[];
  permissionRequests: PermissionInteractiveRequest[];
  hasVisibleResources: boolean;
  isDraftSession: boolean;
  isLoadingOlder: boolean;
  isResourcePickerVisible: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  modelOptions: Array<{ label: string; value: string }>;
  noAgentValue: string;
  currentProjectPath: string;
  prompts: PromptCatalogItem[];
  resourceError: string;
  skills: SkillCatalogItem[];
  status: SessionSummary["status"];
  thinkingOptions: Array<{ value: ThinkingLevel; label: string }>;
}>();

const emit = defineEmits<{
  applyPrompt: [item: PromptCatalogItem];
  createSession: [];
  dismissAsk: [askId: string];
  injectCommand: [value: string];
  injectSkill: [value: string];
  loadEarlier: [];
  respondAsk: [askId: string, answers: AskQuestionAnswer[]];
  respondPermission: [requestId: string, action: "once" | "always" | "reject"];
  returnToParent: [];
  selectAgent: [value: string];
  selectModel: [value: string];
  selectThinking: [value: string];
  submit: [];
  selectProjectPath: [path: string];
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

    <WelcomeEmptyState
      v-if="!activeSessionId"
      class="flex-1"
    />

    <WorkbenchMessageStream
      v-else
      :active-draft-parent-session-id="activeDraftParentSessionId"
      :active-session-id="activeSessionId"
      :has-more-above="hasMoreAbove"
      :interactive-requests="interactiveRequests"

      :permission-requests="permissionRequests"
      :is-draft-session="isDraftSession"
      :is-loading-older="isLoadingOlder"
      :messages="messages"
      :status="status"
      @load-earlier="emit('loadEarlier')"
      @dismiss-ask="emit('dismissAsk', $event)"
      @submit-ask="(askId, answers) => emit('respondAsk', askId, answers)"

      @submit-permission="(requestId, action) => emit('respondPermission', requestId, action)"
    />

    <WorkbenchComposer
      :agents="agents"
      :commands="commands"
      :composer="composer"
      :current-project-path="currentProjectPath"
      :has-visible-resources="hasVisibleResources"
      :is-draft-session="isDraftSession"
      :is-resource-picker-visible="isResourcePickerVisible"
      :is-sending="isSending"
      :model-options="modelOptions"
      :no-agent-value="noAgentValue"
      :prompts="prompts"
      :resource-error="resourceError"
      :skills="skills"
      :thinking-options="thinkingOptions"
      :value="composer.draftText"
      @apply-prompt="emit('applyPrompt', $event)"
      @inject-command="emit('injectCommand', $event)"
      @inject-skill="emit('injectSkill', $event)"
      @select-agent="emit('selectAgent', $event)"
      @select-model="emit('selectModel', $event)"
      @select-thinking="emit('selectThinking', $event)"
      @select-project-path="emit('selectProjectPath', $event)"
      @submit="emit('submit')"
      @abort="emit('abort')"
      @toggle-resource-picker="emit('toggleResourcePicker')"
      @update:value="handleDraftUpdate"
    />
  </div>
</template>
