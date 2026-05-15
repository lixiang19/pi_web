<script setup lang="ts">
import { computed, onMounted, ref, toRef } from "vue";
import { usePerSessionChat } from "@/composables/usePerSessionChat";
import WorkbenchChatPanel from "@/components/workbench/chat/WorkbenchChatPanel.vue";
import { NO_AGENT_VALUE, thinkingOptions } from "@/composables/useWorkbenchSessionState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import WorkspaceFileTree from "@/components/WorkspaceFileTree.vue";
import WorkbenchGitPanel from "@/components/workbench/WorkbenchGitPanel.vue";
import { useGitRepositoryStatus } from "@/composables/useGitRepositoryStatus";
import { FileText, FolderTree, GitBranch, FileDiff } from "lucide-vue-next";
import type { UiConversationMessage } from "@/lib/types";

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

const emit = defineEmits<{
	(e: "open-chat-tab", sessionId: string, title?: string): void;
}>();

const sessionIdRef = toRef(props, "sessionId");
const chat = usePerSessionChat(sessionIdRef);

/** 自动发送是否完成（无论成功/失败） */
const autoSendDone = ref(false);

const isRightSidebarOpen = ref(true);
const rightActiveTab = ref("summary");

const { status: gitStatus } = useGitRepositoryStatus(toRef(() => chat.fileTreeRoot.value));

const userRoundCount = computed(() =>
	chat.messages.value.filter((m) => m.message.role === "user").length,
);

const isTaskSession = computed(() => {
	const session = chat.activeSession.value;
	return Boolean(session?.taskId || session?.sessionType === "task");
});

const isForkDisabled = computed(() => isTaskSession.value);
const forkDisabledReason = computed(() =>
	isTaskSession.value ? "任务处理会话不支持编辑/重试" : undefined,
);

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

const handleEditMessage = async (message: UiConversationMessage) => {
	if (isForkDisabled.value) return;
	const text = typeof message.message.content === "string"
		? message.message.content
		: message.message.content.find((c) => c.type === "text")?.text || "";
	if (!text.trim()) return;
	const forked = await chat.forkSession({ prompt: text });
	if (forked) {
		emit("open-chat-tab", forked.id, forked.title);
	}
};

const handleRetryMessage = async (_message: UiConversationMessage) => {
	if (isForkDisabled.value) return;
	// 重试时找到对应轮次的用户 prompt
	const messages = chat.messages.value;
	const msgIndex = messages.findIndex((m) => m.localId === _message.localId);
	if (msgIndex < 0) return;
	// 向前查找最近的 user message
	let userText = "";
	for (let i = msgIndex - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg?.message.role === "user") {
			const content = msg.message.content;
			userText = typeof content === "string"
				? content
				: content.find((c) => c.type === "text")?.text || "";
			break;
		}
	}
	if (!userText.trim()) return;
	const forked = await chat.forkSession({ prompt: userText });
	if (forked) {
		emit("open-chat-tab", forked.id, forked.title);
	}
};

const handleSelectFile = (_path: string) => {
	// 文件树选择文件暂无操作，可后续扩展为打开文件预览
};
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <div class="flex h-full min-w-0">
      <!-- 中间聊天区 -->
      <main class="min-w-0 flex-1 flex flex-col bg-background">
        <WorkbenchChatPanel
          :active-draft-parent-session-id="chat.activeDraftContext.value?.parentSessionId"
          :active-session-id="chat.sessionId.value"
          :agents="chat.core.agents.value"
          :commands="[]"
          :composer="chat.composer"
          :error="chat.error.value"
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
          :is-fork-disabled="isForkDisabled"
          :fork-disabled-reason="forkDisabledReason"
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
          @edit-message="handleEditMessage"
          @retry-message="handleRetryMessage"
        />
      </main>

      <Separator orientation="vertical" class="h-full shrink-0 bg-border/40" />

      <!-- 右侧工作侧栏 -->
      <aside
        v-show="isRightSidebarOpen"
        class="w-72 flex shrink-0 flex-col bg-secondary overflow-hidden"
      >
        <Tabs v-model="rightActiveTab" class="flex h-full flex-col">
          <TabsList class="mx-2 mt-2 h-8 w-auto grid grid-cols-4 border border-border/50 bg-transparent p-0.5 shrink-0">
            <TabsTrigger value="summary" class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FileText class="mr-1 size-3" />
              摘要
            </TabsTrigger>
            <TabsTrigger value="files" class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FolderTree class="mr-1 size-3" />
              文件
            </TabsTrigger>
            <TabsTrigger value="git" class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <GitBranch class="mr-1 size-3" />
              Git
            </TabsTrigger>
            <TabsTrigger value="diff" class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <FileDiff class="mr-1 size-3" />
              Diff
            </TabsTrigger>
          </TabsList>

          <div class="mt-2 flex-1 overflow-hidden min-h-0">
            <TabsContent value="summary" class="h-full">
              <ScrollArea class="h-full px-3 py-2">
                <div class="space-y-3">
                  <div>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">会话信息</h4>
                    <div class="space-y-1 text-xs text-foreground/80">
                      <p><span class="text-muted-foreground">标题:</span> {{ chat.currentSessionTitle.value }}</p>
                      <p><span class="text-muted-foreground">ID:</span> {{ chat.sessionId.value || '-' }}</p>
                      <p><span class="text-muted-foreground">状态:</span> {{ chat.status.value }}</p>
                      <p><span class="text-muted-foreground">轮次:</span> {{ userRoundCount }}</p>
                    </div>
                  </div>
                  <Separator class="bg-border/30" />
                  <div>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">运行位置</h4>
                    <p class="text-xs text-foreground/80 break-all">{{ chat.fileTreeRoot.value || '未选择' }}</p>
                  </div>
                  <Separator class="bg-border/30" />
                  <div>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">模型</h4>
                    <p class="text-xs text-foreground/80">{{ chat.effectiveModel.value || '默认' }}</p>
                  </div>
                  <Separator class="bg-border/30" />
                  <div>
                    <h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Agent</h4>
                    <p class="text-xs text-foreground/80">{{ chat.effectiveAgent.value || '无' }}</p>
                  </div>
                  <template v-if="isTaskSession">
                    <Separator class="bg-border/30" />
                    <div class="rounded border border-yellow-500/20 bg-yellow-500/10 px-2 py-1.5">
                      <p class="text-[11px] text-yellow-600 dark:text-yellow-400">任务会话：编辑/重试已禁用</p>
                    </div>
                  </template>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="files" class="h-full">
              <WorkspaceFileTree :root-dir="chat.fileTreeRoot.value || workspaceDir" @select-file="handleSelectFile" />
            </TabsContent>

            <TabsContent value="git" class="h-full">
              <WorkbenchGitPanel :cwd="chat.fileTreeRoot.value || workspaceDir" :git-status="gitStatus" />
            </TabsContent>

            <TabsContent value="diff" class="h-full">
              <div class="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <FileDiff class="size-10 text-muted-foreground/30" />
                <div class="space-y-1">
                  <p class="text-sm font-medium text-foreground/80">Diff 暂不可用</p>
                  <p class="text-xs text-muted-foreground">等待隐藏版本管理实现后启用</p>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </div>
  </div>
</template>
