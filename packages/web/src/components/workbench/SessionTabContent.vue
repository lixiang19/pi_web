<script setup lang="ts">
import { computed, onMounted, ref, toRef, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import { ChevronLeft } from "lucide-vue-next";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import {
  DEFAULT_OPERATION_PANEL_WIDTH,
  MAX_OPERATION_PANEL_WIDTH,
  MIN_OPERATION_PANEL_WIDTH,
} from "@/composables/useWorkbenchFilePreview";
import { Button } from "@/components/ui/button";
import { useSessionLruPool } from "@/composables/useSessionLruPool";
import { NO_AGENT_VALUE, thinkingOptions } from "@/composables/useWorkbenchSessionState";
import { useWorkbenchResourcePicker } from "@/composables/useWorkbenchResourcePicker";
import { Separator } from "@/components/ui/separator";
import WorkbenchOperationPanel from "@/components/workbench/WorkbenchOperationPanel.vue";
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

const layoutRef = ref<HTMLElement | null>(null);
const operationPanelRef = ref<{
  openFile: (filePath: string) => Promise<void>;
  flushActiveTab: () => Promise<boolean>;
} | null>(null);
const operationPanelWidth = ref(DEFAULT_OPERATION_PANEL_WIDTH);
const isOperationPanelCollapsed = ref(true);
const isResizingOperationPanel = ref(false);

const RIGHT_PANEL_WIDTH = 320;
const MIN_CHAT_PANEL_WIDTH = 320;

const clampOperationPanelWidth = (value: number) => {
  const layoutWidth = layoutRef.value?.getBoundingClientRect().width ?? Infinity;
  const layoutMaxWidth = Math.max(
    MIN_OPERATION_PANEL_WIDTH,
    Math.min(
      MAX_OPERATION_PANEL_WIDTH,
      layoutWidth - RIGHT_PANEL_WIDTH - MIN_CHAT_PANEL_WIDTH,
    ),
  );

  return Math.min(layoutMaxWidth, Math.max(MIN_OPERATION_PANEL_WIDTH, value));
};

const stopOperationResize = () => {
  if (!isResizingOperationPanel.value) {
    return;
  }

  isResizingOperationPanel.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
};

const expandOperationPanel = () => {
  isOperationPanelCollapsed.value = false;
};

const collapseOperationPanel = async () => {
  const canCollapse = await operationPanelRef.value?.flushActiveTab?.();
  if (canCollapse === false) {
    return;
  }

  stopOperationResize();
  isOperationPanelCollapsed.value = true;
};

const startOperationResize = (event: PointerEvent) => {
  if (!layoutRef.value) {
    return;
  }

  isResizingOperationPanel.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  event.preventDefault();
};

useEventListener(window, "pointermove", (event: PointerEvent) => {
  if (!isResizingOperationPanel.value || !layoutRef.value) {
    return;
  }

  const layoutRect = layoutRef.value.getBoundingClientRect();
  const desiredWidth = layoutRect.right - RIGHT_PANEL_WIDTH - event.clientX;
  operationPanelWidth.value = clampOperationPanelWidth(desiredWidth);
});

useEventListener(window, "pointerup", stopOperationResize);

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

watch(
  () => chat.fileTreeRoot.value,
  () => {
    operationPanelWidth.value = clampOperationPanelWidth(operationPanelWidth.value);
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

const handleOpenFile = (filePath: string) => {
  isOperationPanelCollapsed.value = false;
  void operationPanelRef.value?.openFile(filePath);
};

</script>

<template>
  <div ref="layoutRef" class="flex h-full min-w-0">
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

    <div
      v-if="isOperationPanelCollapsed"
      class="flex w-9 shrink-0 items-center justify-center bg-background/80"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-7"
        @click="expandOperationPanel"
      >
        <ChevronLeft class="size-4" />
      </Button>
    </div>

    <div
      v-else
      class="group flex w-3 shrink-0 cursor-col-resize items-stretch justify-center bg-background/80 transition-colors hover:bg-accent/40"
      @pointerdown="startOperationResize"
    >
      <Separator orientation="vertical" class="h-full bg-border/40 group-hover:bg-primary/40" />
    </div>

    <aside
      v-show="!isOperationPanelCollapsed"
      class="flex shrink-0 flex-col overflow-hidden bg-card/20"
      :style="{ width: `${operationPanelWidth}px` }"
    >
      <WorkbenchOperationPanel
        ref="operationPanelRef"
        :root-dir="chat.fileTreeRoot.value"
        class="flex-1"
        @collapse="collapseOperationPanel"
      />
    </aside>

    <Separator v-show="!isOperationPanelCollapsed" orientation="vertical" class="h-full shrink-0 bg-border/40" />

    <!-- 右侧文件/Git 面板 -->
    <aside class="w-80 flex shrink-0 flex-col bg-secondary">
      <ProjectFilePanel
        :project-label="chat.fileTreeRoot.value ? formatProjectLabel(chat.fileTreeRoot.value) : '未选择项目'"
        :root-dir="chat.fileTreeRoot.value"
        class="flex-1"
        @open-file="handleOpenFile"
      />
    </aside>
  </div>
</template>
