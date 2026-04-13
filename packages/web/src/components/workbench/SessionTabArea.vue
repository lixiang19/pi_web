<script setup lang="ts">
import { useSessionTabs } from "@/composables/useSessionTabs";
import SessionTabBar from "@/components/workbench/SessionTabBar.vue";
import SessionTabContent from "@/components/workbench/SessionTabContent.vue";
import WelcomeEmptyState from "@/components/workbench/WelcomeEmptyState.vue";

const { openTabs, activeTabId, hasTabs } = useSessionTabs();
</script>

<template>
  <div class="flex h-full flex-col min-w-0 flex-1">
    <!-- 标签栏（有标签时显示） -->
    <SessionTabBar v-if="hasTabs" />

    <!-- 标签内容区域：所有标签页始终挂载，用 v-show 切换可见性 -->
    <div v-if="hasTabs" class="flex-1 min-h-0 overflow-hidden relative">
      <div
        v-for="tab in openTabs"
        :key="tab.id"
        v-show="tab.id === activeTabId"
        class="absolute inset-0"
      >
        <SessionTabContent
          :tab-id="tab.id"
          :session-id="tab.sessionId"
          :initial-cwd="tab.cwd"
          :initial-parent-session-id="tab.parentSessionId || ''"
        />
      </div>
    </div>

    <!-- 无标签时的欢迎页 -->
    <WelcomeEmptyState v-else class="flex-1" />
  </div>
</template>
