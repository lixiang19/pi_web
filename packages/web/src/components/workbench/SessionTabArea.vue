<script setup lang="ts">
import { useSessionLruPool } from "@/composables/useSessionLruPool";
import SessionTabContent from "@/components/workbench/SessionTabContent.vue";
import WelcomeEmptyState from "@/components/workbench/WelcomeEmptyState.vue";

const lru = useSessionLruPool();
</script>

<template>
  <div class="flex h-full min-w-0 flex-1 flex-col">
    <div
      v-if="lru.draftView.value || lru.pool.value.length > 0"
      data-test="session-tab-stage"
      class="relative min-h-0 flex-1 overflow-hidden"
    >
      <div
        v-if="lru.draftView.value"
        v-show="lru.isViewingDraft.value || lru.draftView.value.sessionId === lru.activeSessionId.value"
        class="absolute inset-0"
      >
        <SessionTabContent
          :key="lru.draftView.value.key"
          tab-id="__draft__"
          :session-id="lru.draftView.value.sessionId || ''"
          :initial-cwd="lru.draftView.value.cwd"
          :initial-parent-session-id="lru.draftView.value.parentSessionId"
        />
      </div>

      <div
        v-for="entry in lru.pool.value.filter((candidate) => candidate.sessionId !== lru.draftView.value?.sessionId)"
        :key="entry.sessionId"
        v-show="
          lru.activeSessionId.value === entry.sessionId &&
          !lru.isViewingDraft.value
        "
        class="absolute inset-0"
      >
        <SessionTabContent
          :tab-id="entry.sessionId"
          :session-id="entry.sessionId"
          initial-cwd=""
          initial-parent-session-id=""
        />
      </div>
    </div>

    <WelcomeEmptyState
      v-else
      class="flex-1"
    />
  </div>
</template>
