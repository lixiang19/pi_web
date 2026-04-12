<script setup lang="ts">
import { computed } from "vue";
import { Copy } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import { Button } from "@/components/ui/button";
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

const handleCopy = async () => {
  if (!plainText.value.trim()) {
    return;
  }

  await navigator.clipboard.writeText(plainText.value);
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
        class="rounded-2xl bg-primary/10 px-4 py-3 text-foreground"
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

        <div
          v-if="message.pending && getMessageBlocks(message).length === 0"
          class="flex items-center gap-2 py-1 text-xs text-muted-foreground"
        >
          <div class="flex gap-1">
            <span class="size-1.5 rounded-full bg-primary animate-[bounce_1s_infinite_0ms]" />
            <span class="size-1.5 rounded-full bg-primary animate-[bounce_1s_infinite_200ms]" />
            <span class="size-1.5 rounded-full bg-primary animate-[bounce_1s_infinite_400ms]" />
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
          class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
          @click="handleCopy"
        >
          <Copy class="size-3" />
          复制
        </Button>
      </div>
    </div>
  </div>
</template>
