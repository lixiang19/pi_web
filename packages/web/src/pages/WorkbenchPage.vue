<script setup lang="ts">
import SessionSidebar from "@/components/chat/SessionSidebar.vue";
import ProjectFilePanel from "@/components/workbench/ProjectFilePanel.vue";
import WorkbenchChatPanel from "@/components/workbench/chat/WorkbenchChatPanel.vue";
import { useWorkbenchPage } from "@/composables/useWorkbenchPage";

const {
  NO_AGENT_VALUE,
  abort,
  activeDraftContext,
  activeSessionId,
  agents,
  applyPrompt,
  archiveSession,
  composer,
  createSidebarSession,
  setDraftProjectPath,
  currentSessionTitle,
  deleteSession,
  fileTreeRoot,
  filteredCommands,
  filteredPrompts,
  filteredSkills,
  formatProjectLabel,
  handleAgentSelection,
  handleModelSelection,
  handleThinkingSelection,
  hasMoreAbove,
  hasVisibleResources,
  injectCommand,
  injectSkill,
  interactiveRequests,
  permissionRequests,
  isDraftSession,
  isLoadingOlder,
  isResourcePickerVisible,
  isSending,
  loadEarlier,
  messages,
  models,
  openSession,
  parentSessionId,
  prefetchSession,
  renameSession,
  resourceError,
  respondToPendingAsk,
  respondToPendingPermission,
  dismissPendingAsk,
  returnToParentSession,
  sessionSidebarProps,
  status,
  submit,
  thinkingOptions,
  toggleResourcePicker,
} = useWorkbenchPage();
const handleWorktreeCreated = async (worktreePath: string) => {
  // 创建 worktree 后立即创建会话并切换
  await createSidebarSession({ cwd: worktreePath });
};
</script>

<template>
  <div class="h-full">
    <div class="flex h-full">
      <aside class="w-72 flex shrink-0 flex-col bg-sidebar">
        <SessionSidebar
          v-bind="sessionSidebarProps"
          class="flex-1"
          @archive="archiveSession"
          @create="createSidebarSession"
          @prefetch="prefetchSession"
          @remove="deleteSession"
          @rename="renameSession"
          @select="openSession"
          @worktree-created="handleWorktreeCreated"
        />
      </aside>

      <main class="min-w-0 flex-1 flex flex-col bg-background">
        <WorkbenchChatPanel
          :active-draft-parent-session-id="activeDraftContext?.parentSessionId"
          :active-session-id="activeSessionId"
          :agents="agents"
          :commands="filteredCommands"
          :composer="composer"
          :current-session-title="currentSessionTitle"
          :has-more-above="hasMoreAbove"
          :interactive-requests="interactiveRequests"

          :permission-requests="permissionRequests"
          :has-visible-resources="hasVisibleResources"
          :is-draft-session="isDraftSession"
          :is-loading-older="isLoadingOlder"
          :is-resource-picker-visible="isResourcePickerVisible"
          :is-sending="isSending"
          :messages="messages"
          :model-options="models"
          :no-agent-value="NO_AGENT_VALUE"
          :parent-session-id="parentSessionId"
          :project-label="fileTreeRoot ? formatProjectLabel(fileTreeRoot) : '未选择项目'"
          :current-project-path="fileTreeRoot"
          :prompts="filteredPrompts"
          :resource-error="resourceError"
          :skills="filteredSkills"
          :status="status"
          :thinking-options="thinkingOptions"
          class="flex-1"
          @apply-prompt="applyPrompt"
          @create-session="createSidebarSession({})"
          @inject-command="injectCommand"
          @inject-skill="injectSkill"
          @load-earlier="loadEarlier"
          @dismiss-ask="dismissPendingAsk(activeSessionId, $event)"
          @respond-ask="(askId, answers) => respondToPendingAsk(activeSessionId, askId, answers)"

          @respond-permission="(requestId, action) => respondToPendingPermission(activeSessionId, requestId, action)"
          @return-to-parent="returnToParentSession"
          @select-project-path="setDraftProjectPath($event)"
          @select-agent="handleAgentSelection"
          @select-model="handleModelSelection"
          @select-thinking="handleThinkingSelection"
          @submit="submit"
          @abort="abort"
          @toggle-resource-picker="toggleResourcePicker"
          @update:draft-text="composer.draftText = $event"
        />
      </main>

      <aside
        class="w-80 flex shrink-0 flex-col bg-background"
      >
        <ProjectFilePanel
          :project-label="fileTreeRoot ? formatProjectLabel(fileTreeRoot) : '未选择项目'"
          :root-dir="fileTreeRoot"
          class="flex-1"
        />
      </aside>
    </div>
  </div>
</template>
