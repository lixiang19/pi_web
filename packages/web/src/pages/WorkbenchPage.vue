<script setup lang="ts">
import SessionSidebar from "@/components/chat/SessionSidebar.vue";
import ProjectFilePanel from "@/components/workbench/ProjectFilePanel.vue";
import WorkbenchHeader from "@/components/workbench/WorkbenchHeader.vue";
import WorkbenchChatPanel from "@/components/workbench/chat/WorkbenchChatPanel.vue";
import { useWorkbenchPage } from "@/composables/useWorkbenchPage";

const {
  AUTO_MODEL_VALUE,
  AUTO_THINKING_VALUE,
  NO_AGENT_VALUE,
  activeDraftContext,
  activeSessionId,
  agents,
  applyPrompt,
  archiveSession,
  composer,
  createSidebarSession,
  currentSessionTitle,
  deleteSession,
  fileTreeRoot,
  filteredCommands,
  filteredPrompts,
  filteredSkills,
  formatProjectLabel,
  formatShortPath,
  handleAgentSelection,
  handleModelSelection,
  handleThinkingSelection,
  hasMoreAbove,
  hasVisibleResources,
  info,
  injectCommand,
  injectSkill,
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
  returnToParentSession,
  sessionSidebarProps,
  sessions,
  status,
  statusLabel,
  statusTone,
  submit,
  thinkingOptions,
  toggleResourcePicker,
} = useWorkbenchPage();
</script>

<template>
  <div class="space-y-3">
    <WorkbenchHeader
      :sdk-version="info?.sdkVersion"
      :session-count="sessions.length"
      :short-workspace-path="formatShortPath(fileTreeRoot || '')"
      :status-label="statusLabel"
      :status-tone="statusTone"
    />

    <div class="grid flex-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <aside class="min-h-[280px] xl:h-[calc(100vh-12.75rem)]">
        <SessionSidebar
          v-bind="sessionSidebarProps"
          @archive="archiveSession"
          @create="createSidebarSession"
          @prefetch="prefetchSession"
          @remove="deleteSession"
          @rename="renameSession"
          @select="openSession"
        />
      </aside>

      <main class="min-h-[560px] xl:h-[calc(100vh-12.75rem)]">
        <WorkbenchChatPanel
          :active-draft-parent-session-id="activeDraftContext?.parentSessionId"
          :active-session-id="activeSessionId"
          :agents="agents"
          :auto-model-value="AUTO_MODEL_VALUE"
          :auto-thinking-value="AUTO_THINKING_VALUE"
          :commands="filteredCommands"
          :composer="composer"
          :current-session-title="currentSessionTitle"
          :has-more-above="hasMoreAbove"
          :has-visible-resources="hasVisibleResources"
          :is-draft-session="isDraftSession"
          :is-loading-older="isLoadingOlder"
          :is-resource-picker-visible="isResourcePickerVisible"
          :is-sending="isSending"
          :messages="messages"
          :model-options="models"
          :no-agent-value="NO_AGENT_VALUE"
          :parent-session-id="parentSessionId"
          :project-label="formatProjectLabel(fileTreeRoot || 'workspace')"
          :prompts="filteredPrompts"
          :resource-error="resourceError"
          :skills="filteredSkills"
          :status="status"
          :thinking-options="thinkingOptions"
          @apply-prompt="applyPrompt"
          @inject-command="injectCommand"
          @inject-skill="injectSkill"
          @load-earlier="loadEarlier"
          @return-to-parent="returnToParentSession"
          @select-agent="handleAgentSelection"
          @select-model="handleModelSelection"
          @select-thinking="handleThinkingSelection"
          @submit="submit"
          @toggle-resource-picker="toggleResourcePicker"
          @update:draft-text="composer.draftText = $event"
        />
      </main>

      <aside
        class="flex min-h-[400px] flex-col gap-3 xl:h-[calc(100vh-12.75rem)]"
      >
        <ProjectFilePanel
          :project-label="formatProjectLabel(fileTreeRoot)"
          :root-dir="fileTreeRoot"
        />
      </aside>
    </div>
  </div>
</template>
