<script setup lang="ts">
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import ThinkingCard from "@/components/chat/ThinkingCard.vue";
import ToolCallCard from "@/components/chat/ToolCallCard.vue";
import ToolResultCard from "@/components/chat/ToolResultCard.vue";
import type { UiConversationMessage } from "@/lib/types";
import {
  isAssistantMessage,
  isImageContent,
  isTextContent,
  isThinkingContent,
  isToolCallContent,
  isToolResultMessage,
} from "@/lib/conversation";

const props = defineProps<{
  message: UiConversationMessage;
}>();
</script>

<template>
  <div class="space-y-2">
    <template v-if="isAssistantMessage(message.message)">
      <template
        v-for="(content, index) in message.message.content"
        :key="`${message.localId || message.message.timestamp || index}-${index}`"
      >
        <Markdown
          v-if="isTextContent(content)"
          :content="content.text"
          class="max-w-none break-words text-[14px] leading-6 text-foreground/90 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        />

        <ThinkingCard
          v-else-if="isThinkingContent(content)"
          :content="content"
        />

        <ToolCallCard
          v-else-if="isToolCallContent(content)"
          :tool-call="content"
        />

        <img
          v-else-if="isImageContent(content)"
          :src="`data:${content.mimeType};base64,${content.data}`"
          alt=""
          class="max-w-full rounded-md"
        />
      </template>
    </template>

    <ToolResultCard
      v-else-if="isToolResultMessage(message.message)"
      :message="message.message"
    />

    <div
      v-if="message.pending && isAssistantMessage(message.message) && message.message.content.length === 0"
      class="flex items-center gap-2 py-1 text-xs text-muted-foreground"
    >
      <div class="loading-dots flex gap-1">
        <span class="size-1.5 rounded-full bg-primary" />
        <span class="size-1.5 rounded-full bg-primary" />
        <span class="size-1.5 rounded-full bg-primary" />
      </div>
      <span>正在生成…</span>
    </div>
  </div>
</template>

<style scoped>
.loading-dots span {
  animation: pulse 1.4s ease-in-out infinite;
}

.loading-dots span:nth-child(1) {
  animation-delay: 0s;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  40% {
    opacity: 1;
    transform: scale(1.1);
  }
}
</style>
