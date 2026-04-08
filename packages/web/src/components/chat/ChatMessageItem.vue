<script setup lang="ts">
import type { ChatMessage } from "@/lib/types";
import ThinkingCard from "./ThinkingCard.vue";
import ToolCallCard from "./ToolCallCard.vue";

defineProps<{
  message: ChatMessage;
}>();

const formatMessageTime = (timestamp: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
</script>

<template>
  <div
    class="flex w-full group"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <div
      class="relative max-w-[92%] md:max-w-[80%]"
      :class="message.role === 'user' ? 'items-end' : 'items-start'"
    >
      <div
        class="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <span class="font-medium">{{ formatMessageTime(message.createdAt) }}</span>
      </div>

      <div
        class="rounded-2xl px-4 py-3.5 transition-all duration-200"
        :class="
          message.role === 'user'
            ? 'bg-primary/10 text-foreground'
            : message.role === 'assistant'
              ? 'bg-muted text-foreground'
              : 'bg-accent text-accent-foreground font-mono text-xs'
        "
      >
        <div class="space-y-4">
          <template v-for="(block, index) in message.contentBlocks" :key="index">
            <p
              v-if="block.type === 'text' && block.text"
              class="whitespace-pre-wrap break-words text-[15px] leading-7"
            >
              {{ block.text }}
            </p>

            <div v-else-if="block.type === 'image'" class="relative group/img overflow-hidden rounded-2xl border-border">
              <img
                :src="`data:${block.mimeType};base64,${block.data}`"
                class="max-w-full transition-transform duration-500 group-hover/img:scale-105"
                alt="Captured Data"
              />
            </div>

            <ThinkingCard v-else-if="block.type === 'thinking'" :block="block" />

            <ToolCallCard
              v-else-if="block.type === 'toolCall'"
              :block="block"
              :is-result="false"
            />

            <ToolCallCard
              v-else-if="block.type === 'toolResult'"
              :block="block"
              :is-result="true"
            />
          </template>
        </div>

        <div
          v-if="message.pending && message.contentBlocks.length === 0"
          class="flex items-center gap-3 py-2"
        >
          <div class="flex gap-1">
            <span class="size-1 bg-primary animate-[bounce_1s_infinite_0ms]" />
            <span class="size-1 bg-primary animate-[bounce_1s_infinite_200ms]" />
            <span class="size-1 bg-primary animate-[bounce_1s_infinite_400ms]" />
          </div>
          <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Processing Stream...</span>
        </div>
      </div>
    </div>
  </div>
</template>
