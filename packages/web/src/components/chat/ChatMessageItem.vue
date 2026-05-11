<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Check } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import { Button } from "@/components/ui/button";
import type {
  PiTextContent,
  UiConversationMessage,
} from "@/lib/types";
import {
  getAssistantTextContents,
  hasAssistantText,
  isAssistantMessage,
} from "@/lib/conversation";

const props = defineProps<{
  message: UiConversationMessage;
  isFinalAssistantMessage?: boolean;
}>();

const textContents = computed<PiTextContent[]>(() => {
  const currentMessage = props.message.message;

  if (currentMessage.role === "user") {
    if (typeof currentMessage.content === "string") {
      return [{ type: "text", text: currentMessage.content }];
    }
    return currentMessage.content.filter(
      (content): content is PiTextContent => content.type === "text",
    );
  }

  if (!isAssistantMessage(currentMessage)) {
    return [];
  }

  return getAssistantTextContents(currentMessage);
});

const plainText = computed(() =>
  textContents.value.map((content) => content.text).join("\n\n"),
);

const isUserMessage = computed(() => props.message.message.role === "user");
const isFinalAssistantText = computed(
  () =>
    props.message.message.role === "assistant" &&
    props.isFinalAssistantMessage &&
    hasAssistantText(props.message.message),
);

const finalTextContents = computed(() =>
  isFinalAssistantText.value ? textContents.value : [],
);

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
      <div
        v-if="isUserMessage"
        class="user-bubble rounded-2xl rounded-br-md px-4 py-3 text-foreground shadow-sm"
      >
        <Markdown
          v-for="(content, index) in textContents"
          :key="index"
          :content="content.text"
          class="max-w-none break-words text-[15px] leading-6 [&:not(:last-child)]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-2 [&_code]:break-words"
        />
      </div>

      <div v-else class="space-y-2">
        <div v-if="finalTextContents.length" class="space-y-3 text-foreground">
          <Markdown
            v-for="(content, index) in finalTextContents"
            :key="`final-text-${index}`"
            :content="content.text"
            class="max-w-none break-words text-[15px] leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_code]:break-words"
          />
        </div>

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
          {{ isCopied ? "已复制" : "复制" }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-bubble {
  background: linear-gradient(
    135deg,
    color-mix(in oklab, var(--primary) 8%, var(--background)) 0%,
    color-mix(in oklab, var(--primary) 12%, var(--background)) 100%
  );
}

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
