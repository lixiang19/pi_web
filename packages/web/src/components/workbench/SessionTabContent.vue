<script setup lang="ts">
import { computed, onMounted, toRef, watch } from "vue";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import { useSessionLruPool } from "@/composables/useSessionLruPool";
import { NO_AGENT_VALUE, thinkingOptions } from "@/composables/useWorkbenchSessionState";
import { useWorkbenchResourcePicker } from "@/composables/useWorkbenchResourcePicker";
import WorkbenchChatPanel from "@/components/workbench/chat/WorkbenchChatPanel.vue";
import ProjectFilePanel from "@/components/workbench/ProjectFilePanel.vue";

const props = defineProps<{
  tabId: string;
  sessionId: string;
  initialCwd: string;
  initialParentSessionId: string;
}>();

const sessionIdRef = toRef(props, "sessionId");
const chat = usePerSessionChat(sessionIdRef);
const lru = useSessionLruPool();
// 构建 PiChatState 兼容接口给 resourcePicker
const chatState = {
  composer: chat.composer,
  activeSessionId: chat.sessionId,
  resources: chat.core.resources,
  refreshResources: chat.core.refreshResources,
};
const resourcePicker = useWorkbenchResourcePicker(chatState, chat.fileTreeRoot);

const parentSessionId = computed(
  () =>
    chat.activeSession.value?.parentSessionId ||
    chat.activeDraftContext.value?.parentSessionId ||
    "",
);

watch(
  () => chat.sessionId.value,
  (nextSessionId, previousSessionId) => {
    if (!nextSessionId || nextSessionId === previousSessionId) {
      return;
    }

    if (!props.sessionId && !previousSessionId) {
      lru.promoteDraftToSession(nextSessionId);
      return;
    }

    lru.activateSession(nextSessionId);
  },
);

watch(
  [() => chat.sessionId.value, () => chat.status.value],
  ([nextSessionId, nextStatus]) => {
    if (!nextSessionId) {
      return;
    }

    lru.setStreaming(nextSessionId, nextStatus === "streaming");
  },
  { immediate: true },
);

onMounted(async () => {
  if (props.sessionId) {
    await chat.loadSession(props.sessionId);
    return;
  }

  await chat.openSessionDraft({
    cwd: props.initialCwd || undefined,
    parentSessionId: props.initialParentSessionId || undefined,
  });
});

const formatProjectLabel = (cwd: string) => {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || cwd;
};

</script>

<template>
  <div class="flex h-full">
    <!-- 中间对话区 -->
    <main class="min-w-0 flex-1 flex flex-col bg-background">
      <WorkbenchChatPanel
        :active-draft-parent-session-id="chat.activeDraftContext.value?.parentSessionId"
        :active-session-id="chat.sessionId.value"
        :agents="chat.core.agents.value"
        :commands="resourcePicker.filteredCommands.value"
        :composer="chat.composer"
        :has-more-above="chat.hasMoreAbove.value"
        :interactive-requests="chat.interactiveRequests.value"
        :permission-requests="chat.permissionRequests.value"
        :has-visible-resources="resourcePicker.hasVisibleResources.value"
        :is-draft-session="chat.isDraftSession.value"
        :is-loading-older="chat.isLoadingOlder.value"
        :is-resource-picker-visible="resourcePicker.isResourcePickerVisible.value"
        :is-sending="chat.isSending.value"
        :messages="chat.messages.value"
        :model-options="chat.core.models.value"
        :no-agent-value="NO_AGENT_VALUE"
        :current-project-path="chat.fileTreeRoot.value"
        :prompts="resourcePicker.filteredPrompts.value"
        :resource-error="chat.core.resourceError.value"
        :skills="resourcePicker.filteredSkills.value"
        :status="chat.status.value"
        :thinking-options="thinkingOptions"
        class="flex-1"
        @apply-prompt="resourcePicker.applyPrompt($event)"
        @create-session="chat.openSessionDraft({})"
        @inject-command="resourcePicker.injectCommand($event)"
        @inject-skill="resourcePicker.injectSkill($event)"
        @load-earlier="chat.loadEarlier()"
        @dismiss-ask="chat.dismissPendingAsk(sessionId, $event)"
        @respond-ask="(askId, answers) => chat.respondToPendingAsk(sessionId, askId, answers)"
        @respond-permission="(requestId, action) => chat.respondToPendingPermission(sessionId, requestId, action)"
        @return-to-parent="parentSessionId && chat.loadSession(parentSessionId)"
        @select-project-path="chat.setDraftProjectPath($event)"
        @select-agent="chat.setSelectedAgent($event === NO_AGENT_VALUE ? '' : $event)"
        @select-model="chat.setSelectedModel($event)"
        @select-thinking="chat.setSelectedThinkingLevel($event)"
        @submit="chat.submit()"
        @abort="chat.abort()"
        @toggle-resource-picker="resourcePicker.toggleResourcePicker()"
        @update:draft-text="chat.composer.draftText = $event"
      />
    </main>

    <!-- 右侧文件/Git 面板 -->
    <aside class="w-80 flex shrink-0 flex-col bg-secondary">
      <ProjectFilePanel
        :project-label="chat.fileTreeRoot.value ? formatProjectLabel(chat.fileTreeRoot.value) : '未选择项目'"
        :root-dir="chat.fileTreeRoot.value"
        class="flex-1"
      />
    </aside>
  </div>
</template>
