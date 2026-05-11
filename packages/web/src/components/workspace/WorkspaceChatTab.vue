<script setup lang="ts">
import { computed, onMounted, ref, toRef } from "vue";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import WorkbenchChatPanel from "@/components/workbench/chat/WorkbenchChatPanel.vue";
import SessionWorkspaceSidebar from "@/components/workspace/SessionWorkspaceSidebar.vue";
import { NO_AGENT_VALUE, thinkingOptions } from "@/composables/useWorkbenchSessionState";
import { PanelRightOpen, PanelRightClose } from "lucide-vue-next";

const props = defineProps<{
	sessionId: string;
	workspaceDir: string;
	/** 首页→会话转换时传入的首条消息；挂载后自动发送 */
	initialPrompt?: string;
	/** 首页→会话转换时传入的模型选择 */
	initialModel?: string;
	/** 首页→会话转换时传入的 Agent 选择 */
	initialAgent?: string;
	/** 首页→会话转换时传入的思考强度选择 */
	initialThinkingLevel?: string;
	/** 首页→会话转换时传入的附件 ID 列表 */
	initialAttachmentIds?: string[];
}>();

const sessionIdRef = toRef(props, "sessionId");
const chat = usePerSessionChat(sessionIdRef);

const sidebarVisible = ref(true);

/** 自动发送是否完成（无论成功/失败） */
const autoSendDone = ref(false);

onMounted(async () => {
	if (props.sessionId) {
		await chat.loadSession(props.sessionId);
	} else {
		await chat.openSessionDraft({ cwd: props.workspaceDir || undefined });
	}

	// 首页→会话转换：自动发送首条消息
	if (props.initialPrompt && !autoSendDone.value) {
		autoSendDone.value = true;
		chat.composer.draftText = props.initialPrompt;

		if (props.initialModel) {
			chat.composer.selectedModel = props.initialModel;
		}
		if (props.initialThinkingLevel) {
			chat.composer.selectedThinkingLevel = props.initialThinkingLevel as import("@/lib/types").ThinkingLevel;
		}
		// NO_AGENT_VALUE 不应作为真实 agent 写入 composer；空字符串即无 agent
		if (props.initialAgent && props.initialAgent !== NO_AGENT_VALUE) {
			chat.composer.selectedAgent = props.initialAgent;
		}

		// 等 nextTick 让 composer 状态生效后再提交，带附件
		await chat.submit(props.initialAttachmentIds);
	}
});

const sidebarProjectType = computed<"internal" | "external" | undefined>(() => {
	const session = chat.activeSession.value;
	const ctx = chat.activeSessionContext.value;
	// Use session metadata first, then context
	const projectId = session?.projectId || ctx?.projectId;
	if (!projectId) return undefined;
	if (projectId === "ridge:workspace-chat") return undefined;
	// If sessionType is workspace or contextType is workspace, treat as internal
	if (session?.sessionType === "workspace" || session?.contextType === "workspace" || ctx?.worktreeRoot === props.workspaceDir) {
		return "internal";
	}
	return "external";
});

const sidebarIsGit = computed(() => chat.activeSessionContext.value?.isGit ?? false);
const sidebarMessageCount = computed(() => chat.messages.value.length);
const sidebarRoundCount = computed(() => {
	// Count user messages as rounds
	return chat.messages.value.filter((m) => m.message.role === "user").length;
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <div class="flex h-full min-h-0">
      <WorkbenchChatPanel
        :active-draft-parent-session-id="chat.activeDraftContext.value?.parentSessionId"
        :active-session-id="chat.sessionId.value"
        :agents="chat.core.agents.value"
        :commands="[]"
        :composer="chat.composer"
        :has-more-above="chat.hasMoreAbove.value"
        :interactive-requests="chat.interactiveRequests.value"
        :permission-requests="chat.permissionRequests.value"
        :has-visible-resources="false"
        :is-draft-session="chat.isDraftSession.value"
        :is-loading-older="chat.isLoadingOlder.value"
        :is-resource-picker-visible="false"
        :is-sending="chat.isSending.value"
        :messages="chat.messages.value"
        :model-options="chat.core.models.value"
        :no-agent-value="NO_AGENT_VALUE"
        :current-project-path="chat.fileTreeRoot.value"
        :prompts="[]"
        :resource-error="chat.core.resourceError.value"
        :skills="[]"
        :status="chat.status.value"
        :thinking-options="thinkingOptions"
        :readonly="chat.isReadonly.value"
        :is-task-session="chat.isTaskSession.value"
        class="flex-1"
        @create-session="chat.openSessionDraft({})"
        @dismiss-ask="chat.dismissPendingAsk(sessionId, $event)"
        @load-earlier="chat.loadEarlier()"
        @respond-ask="(askId, answers) => chat.respondToPendingAsk(sessionId, askId, answers)"
        @respond-permission="(requestId, action) => chat.respondToPendingPermission(sessionId, requestId, action)"
        @select-agent="chat.setSelectedAgent($event === NO_AGENT_VALUE ? '' : $event)"
        @select-model="chat.setSelectedModel($event)"
        @select-thinking="chat.setSelectedThinkingLevel($event)"
        @select-project-path="chat.setDraftProjectPath($event)"
        @submit="chat.submit()"
        @abort="chat.abort()"
        @update:draft-text="chat.composer.draftText = $event"
        @edit-message="(index, text) => chat.forkFromUserMessage(index, text)"
        @retry-message="chat.forkFromAssistantRetry"
      />
      <SessionWorkspaceSidebar
        v-if="sidebarVisible"
        :session-id="chat.sessionId.value || ''"
        :session-title="chat.currentSessionTitle.value"
        :file-tree-root="chat.fileTreeRoot.value"
        :project-type="sidebarProjectType"
        :is-git="sidebarIsGit"
        :is-online="true"
        :message-count="sidebarMessageCount"
        :round-count="sidebarRoundCount"
        class="w-64 shrink-0 border-l"
      />
      <div class="flex flex-col items-center justify-start gap-2 border-l bg-background px-1 py-2">
        <button
          type="button"
          class="rounded-md p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          :title="sidebarVisible ? '隐藏侧栏' : '显示侧栏'"
          @click="sidebarVisible = !sidebarVisible"
        >
          <PanelRightClose v-if="sidebarVisible" class="size-4" />
          <PanelRightOpen v-else class="size-4" />
        </button>
      </div>
    </div>
  </div>
</template>
