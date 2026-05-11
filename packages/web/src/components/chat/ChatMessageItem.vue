<script setup lang="ts">
import { computed, ref } from "vue";
import { Copy, Check, Pencil, RotateCw, X, SendHorizontal } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  readonly?: boolean;
  isTaskSession?: boolean;
}>();

const emit = defineEmits<{
  edit: [newText: string];
  retry: [];
  copy: [];
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
  emit("copy");
  setTimeout(() => {
    isCopied.value = false;
  }, 2000);
};

const canEdit = computed(() => isUserMessage.value && !props.readonly && !props.isTaskSession);
const canRetry = computed(() => isFinalAssistantText.value && !props.readonly && !props.isTaskSession);

// Inline editing state
const isEditing = ref(false);
const editDraft = ref("");

const startEdit = () => {
  editDraft.value = plainText.value;
  isEditing.value = true;
};

const cancelEdit = () => {
  isEditing.value = false;
  editDraft.value = "";
};

const submitEdit = () => {
  const text = editDraft.value.trim();
  if (!text) return;
  isEditing.value = false;
  emit("edit", text);
};
</script>

<template>
  <div
    class="group flex w-full"
    :class="isUserMessage ? 'justify-end' : 'justify-start'"
  >
    <div class="flex max-w-[85%] min-w-0 flex-col md:max-w-[75%]">
      <!-- Inline editing for user messages -->
      <div
        v-if="isUserMessage && isEditing"
        class="user-bubble rounded-2xl rounded-br-md px-4 py-3 text-foreground shadow-sm"
      >
        <Textarea
          v-model="editDraft"
          class="min-h-[80px] resize-none border-0 bg-transparent p-0 text-[15px] leading-6 focus-visible:ring-0 focus-visible:ring-offset-0"
          @keydown.enter.exact.prevent="submitEdit"
        />
        <div class="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" class="h-7 text-xs" @click="cancelEdit">
            <X class="size-3 mr-1" />
            取消
          </Button>
          <Button variant="secondary" size="sm" class="h-7 text-xs" @click="submitEdit">
            <SendHorizontal class="size-3 mr-1" />
            提交
          </Button>
        </div>
      </div>

      <div
        v-else-if="isUserMessage"
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
        class="mt-1 flex gap-1"
      >
        <Button
          v-if="plainText.trim()"
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
        <Button
          v-if="canEdit && !isEditing"
          variant="ghost"
          size="sm"
          class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
          @click="startEdit"
        >
          <Pencil class="size-3" />
          编辑
        </Button>
        <Button
          v-if="canRetry"
          variant="ghost"
          size="sm"
          class="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
          @click="emit('retry')"
        >
          <RotateCw class="size-3" />
          重试
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
