<script setup lang="ts">
import WelcomeEmptyState from "@/components/workbench/WelcomeEmptyState.vue";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-vue-next";
import WorkbenchComposer from "./WorkbenchComposer.vue";
import WorkbenchMessageStream from "./WorkbenchMessageStream.vue";
import type {
  AgentSummary,
  AskInteractiveRequest,
  AskQuestionAnswer,
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
  interactiveRequests: AskInteractiveRequest[];
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
    <div class="ridge-panel-header shrink-0">
      <div class="flex items-center justify-between px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2">
          <Button
            v-if="parentSessionId"
            variant="ghost"
            size="sm"
            class="h-8 px-2"
            @click="emit('returnToParent')"
          >
            <ChevronLeft class="mr-1 h-4 w-4" />
            返回父会话
          </Button>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-foreground">
              {{ currentSessionTitle || "新会话" }}
            </p>
            <p v-if="projectLabel" class="truncate text-xs text-muted-foreground">
              {{ projectLabel }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <span
            v-if="status === 'streaming'"
            class="inline-flex items-center gap-1.5 text-primary"
          >
            <span class="relative flex h-2 w-2">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span class="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            生成中
          </span>
          <span v-else-if="isDraftSession" class="text-muted-foreground">
            草稿态
          </span>
        </div>
      </div>
    </div>

    <WelcomeEmptyState
      v-if="!activeSessionId"
      :current-project-path="currentProjectPath"
      class="flex-1"
      @select-path="emit('selectProjectPath', $event)"
    />

    <WorkbenchMessageStream
      v-else
      :active-draft-parent-session-id="activeDraftParentSessionId"
      :active-session-id="activeSessionId"
      :has-more-above="hasMoreAbove"
      :interactive-requests="interactiveRequests"
      :is-draft-session="isDraftSession"
      :is-loading-older="isLoadingOlder"
      :messages="messages"
      :status="status"
      @load-earlier="emit('loadEarlier')"
      @dismiss-ask="emit('dismissAsk', $event)"
      @submit-ask="(askId, answers) => emit('respondAsk', askId, answers)"
    />

    <WorkbenchComposer
      :agents="agents"
      :auto-model-value="autoModelValue"
      :auto-thinking-value="autoThinkingValue"
      :commands="commands"
      :composer="composer"
      :has-visible-resources="hasVisibleResources"
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
      @submit="emit('submit')"
      @abort="emit('abort')"
      @toggle-resource-picker="emit('toggleResourcePicker')"
      @update:value="handleDraftUpdate"
    />
  </div>
</template>
