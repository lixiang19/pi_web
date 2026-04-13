<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Check } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";
import type { ChatMessage, ContentBlock, TextContentBlock } from "@/lib/types";
const props = defineProps<{
  message: ChatMessage;
  isFinalAssistantMessage?: boolean;
}>();
const getMessageBlocks = (message: ChatMessage): ContentBlock[] =>
  typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : message.content;
const textBlocks = computed(() =>
  getMessageBlocks(props.message).filter(
    (block): block is TextContentBlock =>
      block.type === "text" && Boolean(block.text?.trim()),
  ),
);
const plainText = computed(() =>
  textBlocks.value.map((block) => block.text || "").join("\n\n"),
);
const isUserMessage = computed(() => props.message.role === "user");
const isFinalAssistantText = computed(
  () => props.message.role === "assistant" && props.isFinalAssistantMessage,
);
const finalTextBlocks = computed(() =>
  isFinalAssistantText.value ? textBlocks.value : [],
);

// 复制状态
const isCopied = ref(false);
const handleCopy = async () => {
  if (!plainText.value.trim()) {
    return;
  }
  await navigator.clipboard.writeText(plainText.value);
  isCopied.value = true;
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
};
</script>

<template>
  <div
    class="group flex w-full"
    :class="isUserMessage ? 'justify-end' : 'justify-start'"
  >
    <div class="flex max-w-[85%] min-w-0 flex-col md:max-w-[75%]">
      <!-- 用户消息气泡 -->
      <div
        v-if="isUserMessage"
        class="user-bubble rounded-2xl rounded-br-md px-4 py-3 text-foreground shadow-sm"
      >
        <Markdown
          v-for="(block, index) in textBlocks"
          :key="index"
          :content="block.text || ''"
          class="max-w-none break-words text-[15px] leading-6 [&:not(:last-child)]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2 [&_code]:break-words"
        />
      </div>

      <div v-else class="space-y-2">
        <div v-if="finalTextBlocks.length" class="space-y-3 text-foreground">
          <Markdown
            v-for="(block, index) in finalTextBlocks"
            :key="`final-text-${index}`"
            :content="block.text || ''"
            class="max-w-none break-words text-[15px] leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_code]:break-words"
          />
        </div>

        <!-- 加载动画 -->
        <div
          v-if="message.pending && getMessageBlocks(message).length === 0"
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

      <!-- 复制按钮 -->
      <div
        v-if="isFinalAssistantText && plainText.trim()"
        class="mt-1 flex"
      >
        <Button
          variant="ghost"
          size="sm"
          class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
          :class="isCopied ? '!text-primary' : ''"
          @click="handleCopy"
        >
          <Check v-if="isCopied" class="size-3" />
          <Copy v-else class="size-3" />
          {{ isCopied ? '已复制' : '复制' }}
        </Button>
      </div>
    </div>
  </div>
</template>
<style scoped>
/* 用户消息气泡渐变 */
.user-bubble {
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--primary) 8%, var(--background)) 0%,
    color-mix(in oklab, var(--primary) 12%, var(--background)) 100%
  );
}

/* 加载动画 */
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