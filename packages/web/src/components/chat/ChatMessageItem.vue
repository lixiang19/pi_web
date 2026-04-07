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
    class="flex"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <div
      class="max-w-[90%] space-y-2 rounded-[28px] border px-4 py-3 shadow-sm sm:max-w-[78%]"
      :class="
        message.role === 'user'
          ? 'border-amber-400/25 bg-amber-500/12 text-stone-50'
          : message.role === 'assistant'
            ? 'border-white/10 bg-white/[0.05] text-stone-100'
            : 'border-sky-400/20 bg-sky-500/10 text-sky-50'
      "
    >
      <!-- 头部信息 -->
      <div
        class="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-stone-400"
      >
        <span>{{
          message.role === "user"
            ? "You"
            : message.role === "assistant"
              ? "Pi"
              : "System"
        }}</span>
        <span class="h-1 w-1 rounded-full bg-current/40" />
        <span>{{ formatMessageTime(message.createdAt) }}</span>
        <span
          v-if="message.pending"
          class="ml-auto flex items-center gap-1 text-amber-300"
        >
          <span class="size-1.5 animate-pulse rounded-full bg-amber-400" />
          生成中
        </span>
      </div>

      <!-- 内容块列表 -->
      <div class="space-y-2">
        <template v-for="(block, index) in message.contentBlocks" :key="index">
          <!-- 文本块 -->
          <p
            v-if="block.type === 'text' && block.text"
            class="whitespace-pre-wrap break-words text-sm leading-7 sm:text-[15px]"
          >
            {{ block.text }}
          </p>

          <!-- 图片块 -->
          <img
            v-else-if="block.type === 'image'"
            :src="`data:${block.mimeType};base64,${block.data}`"
            class="max-w-full rounded-2xl border border-white/10"
            alt="Image"
          />

          <!-- 思考块 -->
          <ThinkingCard v-else-if="block.type === 'thinking'" :block="block" />

          <!-- 工具调用块 -->
          <ToolCallCard
            v-else-if="block.type === 'toolCall'"
            :block="block"
            :is-result="false"
          />

          <!-- 工具结果块 -->
          <ToolCallCard
            v-else-if="block.type === 'toolResult'"
            :block="block"
            :is-result="true"
          />
        </template>

        <!-- 空状态或纯占位（向后兼容） -->
        <div
          v-if="message.contentBlocks.length === 0 && message.pending"
          class="flex items-center gap-2 text-sm text-stone-400"
        >
          <span class="size-2 animate-pulse rounded-full bg-amber-400" />
          正在生成…
        </div>
      </div>

      <!-- 底部摘要（当 contentBlocks 为空但有 text 时） -->
      <p
        v-if="message.contentBlocks.length === 0 && message.text"
        class="whitespace-pre-wrap break-words text-sm leading-7 sm:text-[15px]"
      >
        {{ message.text }}
      </p>
    </div>
  </div>
</template>
