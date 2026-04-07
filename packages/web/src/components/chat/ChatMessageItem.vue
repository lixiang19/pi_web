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
      class="relative max-w-[90%] md:max-w-[85%] px-1"
      :class="message.role === 'user' ? 'items-end' : 'items-start'"
    >
      <div
        class="mb-1.5 flex items-center gap-2 px-1 text-[9px] font-black uppercase tracking-[0.2em] text-stone-500"
      >
        <div 
          v-if="message.role !== 'user'"
          class="size-1.5 rounded-full"
          :class="message.role === 'assistant' ? 'bg-amber-500' : 'bg-sky-500'"
        />
        <span>{{
          message.role === "user"
            ? "COMMANDER"
            : message.role === "assistant"
              ? "CHAMBER_CORE"
              : "SYSTEM_PROCESS"
        }}</span>
        <span class="opacity-30">/</span>
        <span>{{ formatMessageTime(message.createdAt) }}</span>
      </div>

      <div
        class="rounded-[24px] border px-5 py-4 shadow-2xl transition-all duration-300"
        :class="
          message.role === 'user'
            ? 'border-amber-500/20 bg-amber-500/[0.03] text-stone-100'
            : message.role === 'assistant'
              ? 'border-white/5 bg-white/[0.02] text-stone-200'
              : 'border-sky-500/20 bg-sky-500/[0.03] text-sky-100 font-mono text-xs'
        "
      >
        <div class="space-y-4">
          <template v-for="(block, index) in message.contentBlocks" :key="index">
            <p
              v-if="block.type === 'text' && block.text"
              class="whitespace-pre-wrap break-words text-[15px] leading-relaxed tracking-tight"
            >
              {{ block.text }}
            </p>

            <div v-else-if="block.type === 'image'" class="relative group/img overflow-hidden rounded-2xl border border-white/10">
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
            <span class="size-1 bg-amber-500 animate-[bounce_1s_infinite_0ms]" />
            <span class="size-1 bg-amber-500 animate-[bounce_1s_infinite_200ms]" />
            <span class="size-1 bg-amber-500 animate-[bounce_1s_infinite_400ms]" />
          </div>
          <span class="text-[10px] font-bold uppercase tracking-widest text-amber-500/50">Processing Stream...</span>
        </div>
      </div>
    </div>
  </div>
</template>
