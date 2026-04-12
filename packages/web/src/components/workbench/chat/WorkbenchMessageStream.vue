<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowDown, Brain } from "lucide-vue-next";

import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";
import AskCard from "@/components/chat/AskCard.vue";
import PermissionRequestCard from "@/components/chat/PermissionRequestCard.vue";
import ChatProcessGroup from "@/components/chat/ChatProcessGroup.vue";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  AskQuestionAnswer,
  AskInteractiveRequest,
  PermissionInteractiveRequest,
  ChatMessage,
  ContentBlock,
  SessionSummary,
  TextContentBlock,
} from "@/lib/types";
const props = defineProps<{
  activeDraftParentSessionId?: string | undefined;
  activeSessionId: string;
  hasMoreAbove: boolean;
  interactiveRequests: AskInteractiveRequest[];
  permissionRequests: PermissionInteractiveRequest[];
  isDraftSession: boolean;
  isLoadingOlder: boolean;
  messages: ChatMessage[];
  status: SessionSummary["status"];
}>();

const emit = defineEmits<{
  dismissAsk: [askId: string];
  loadEarlier: [];
  submitAsk: [askId: string, answers: AskQuestionAnswer[]];
  submitPermission: [requestId: string, action: "once" | "always" | "reject"];
}>();

const messageScrollArea = ref<HTMLElement | { $el?: Element } | null>(null);
const showJumpToBottom = ref(false);
const isPinnedToBottom = ref(true);
const hasExpandedHistory = ref(false);

let boundMessageViewport: HTMLElement | null = null;

const getMessageBlocks = (message: ChatMessage): ContentBlock[] =>
  typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : message.content;

const hasTextBody = (message: ChatMessage) =>
  getMessageBlocks(message).some(
    (block): block is TextContentBlock =>
      block.type === "text" && Boolean(block.text?.trim()),
  );

const messageKey = (message: ChatMessage, index: number) =>
  `${message.timestamp || "no-ts"}-${message.role}-${message.localId || index}-${index}`;

type MessageRound = {
  key: string;
  userMessage: ChatMessage;
  processMessages: ChatMessage[];
  finalMessage: ChatMessage | null;
};

const conversationLayout = computed(() => {
  const rounds: MessageRound[] = [];
  const allMessages = props.messages;
  const defaultStartIndex = allMessages.findLastIndex((message) => message.role === "user");
  const expandedStartIndex = allMessages.findIndex((message) => message.role === "user");
  const startIndex = hasExpandedHistory.value
    ? expandedStartIndex
    : defaultStartIndex;
  const alignedMessages = startIndex >= 0 ? allMessages.slice(startIndex) : allMessages;
  const preludeMessages = alignedMessages.length > 0 && alignedMessages[0]?.role !== "user"
    ? alignedMessages
    : [] as ChatMessage[];

  let cursor = preludeMessages.length;
  while (cursor < alignedMessages.length) {
    const userMessage = alignedMessages[cursor];
    if (!userMessage || userMessage.role !== "user") {
      cursor += 1;
      continue;
    }

    let nextUserIndex = cursor + 1;
    while (nextUserIndex < alignedMessages.length && alignedMessages[nextUserIndex]?.role !== "user") {
      nextUserIndex += 1;
    }

    const roundMessages = alignedMessages.slice(cursor + 1, nextUserIndex);
    let finalMessage: ChatMessage | null = null;
    let finalMessageIndex = -1;

    for (let index = roundMessages.length - 1; index >= 0; index -= 1) {
      const message = roundMessages[index];
      if (message?.role === "assistant" && hasTextBody(message)) {
        finalMessage = message;
        finalMessageIndex = index;
        break;
      }
    }

    const processMessages =
      finalMessageIndex >= 0
        ? roundMessages.filter((_, index) => index !== finalMessageIndex)
        : roundMessages;

    rounds.push({
      key: messageKey(userMessage, cursor),
      userMessage,
      processMessages,
      finalMessage,
    });

    cursor = nextUserIndex;
  }

  return {
    preludeMessages,
    rounds,
  };
});

const resolveMessageViewport = () => {
  const host = messageScrollArea.value;
  const rootElement = host && "$el" in host ? host.$el : host;

  if (!(rootElement instanceof Element)) {
    return null;
  }

  return rootElement.querySelector(
    '[data-slot="scroll-area-viewport"]',
  ) as HTMLElement | null;
};

const syncScrollState = () => {
  const viewport = resolveMessageViewport();
  if (!viewport) {
    showJumpToBottom.value = false;
    isPinnedToBottom.value = true;
    return;
  }

  const remaining =
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  isPinnedToBottom.value = remaining <= 56;
  showJumpToBottom.value = props.messages.length > 0 && !isPinnedToBottom.value;
};

const handleViewportScroll = () => {
  syncScrollState();
};

const bindMessageViewport = async () => {
  await nextTick();

  const nextViewport = resolveMessageViewport();
  if (nextViewport === boundMessageViewport) {
    syncScrollState();
    return;
  }

  boundMessageViewport?.removeEventListener("scroll", handleViewportScroll);
  boundMessageViewport = nextViewport;
  boundMessageViewport?.addEventListener("scroll", handleViewportScroll, {
    passive: true,
  });
  syncScrollState();
};

const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
  const viewport = resolveMessageViewport();
  if (!viewport) {
    return;
  }

  viewport.scrollTo({
    top: viewport.scrollHeight,
    behavior,
  });
  syncScrollState();
};

const loadEarlierMessages = async () => {
  const viewport = resolveMessageViewport();
  const previousHeight = viewport?.scrollHeight ?? 0;
  const previousTop = viewport?.scrollTop ?? 0;

  hasExpandedHistory.value = true;
  emit("loadEarlier");
  await nextTick();

  if (viewport) {
    const heightDelta = viewport.scrollHeight - previousHeight;
    viewport.scrollTop = previousTop + heightDelta;
  }

  syncScrollState();
};

watch(
  () => props.activeSessionId,
  async () => {
    hasExpandedHistory.value = false;
    await bindMessageViewport();
    scrollToBottom("auto");
  },
);

watch(
  () => props.activeDraftParentSessionId,
  async () => {
    hasExpandedHistory.value = false;
    await bindMessageViewport();
    scrollToBottom("auto");
  },
);

watch(
  () => props.messages.length,
  async (nextLength, previousLength) => {
    await nextTick();
    if (
      nextLength > previousLength &&
      (isPinnedToBottom.value || props.status === "streaming")
    ) {
      scrollToBottom(props.status === "streaming" ? "auto" : "smooth");
      return;
    }

    syncScrollState();
  },
);

watch(
  () => JSON.stringify(props.messages.at(-1)?.content ?? ""),
  async () => {
    await nextTick();
    if (isPinnedToBottom.value || props.status === "streaming") {
      scrollToBottom(props.status === "streaming" ? "auto" : "smooth");
      return;
    }

    syncScrollState();
  },
);

watch(
  () => props.interactiveRequests.length + props.permissionRequests.length,
  async (nextLength, previousLength) => {
    await nextTick();
    if (nextLength > previousLength) {
      scrollToBottom("auto");
    }
  },
);

onMounted(() => {
  void bindMessageViewport();
});

onBeforeUnmount(() => {
  boundMessageViewport?.removeEventListener("scroll", handleViewportScroll);
  boundMessageViewport = null;
});
</script>

<template>
  <div class="relative flex-1 overflow-hidden">
    <ScrollArea ref="messageScrollArea" class="h-full">
      <div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4">
        <div
          v-if="messages.length === 0 && interactiveRequests.length === 0 && permissionRequests.length === 0"
          class="flex flex-col items-center justify-center gap-4 py-20 text-center"
        >
          <div class="rounded-full border border-border p-4 text-muted-foreground">
            <Brain class="size-8" />
          </div>
          <div class="space-y-1">
            <h3 class="text-lg font-semibold text-foreground">
              {{ isDraftSession ? "开始新的会话" : "暂无消息" }}
            </h3>
            <p class="mx-auto max-w-xs text-sm text-muted-foreground">
              发送一条消息开始对话，或通过资源面板插入 prompt、skill 与 command。
            </p>
          </div>
        </div>
        <template v-else>
          <div v-if="hasMoreAbove" class="flex justify-center pb-4">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-xs"
              :disabled="isLoadingOlder"
              @click="loadEarlierMessages"
            >
              {{ isLoadingOlder ? "加载中..." : "加载更早消息" }}
            </Button>
          </div>

          <ChatProcessGroup
            v-if="conversationLayout.preludeMessages.length"
            :messages="conversationLayout.preludeMessages"
          />

          <template v-for="round in conversationLayout.rounds" :key="round.key">
            <ChatMessageItem :message="round.userMessage" />

            <ChatProcessGroup
              v-if="round.processMessages.length"
              :messages="round.processMessages"
            />

            <ChatMessageItem
              v-if="round.finalMessage"
              :message="round.finalMessage"
              :is-final-assistant-message="true"
            />
          </template>

          <div
            v-if="permissionRequests.length"
            class="space-y-3"
          >
            <PermissionRequestCard
              v-for="request in permissionRequests"
              :key="request.id"
              :request="request"
              @submit="emit('submitPermission', request.id, $event)"
            />
          </div>
          <div
            v-if="interactiveRequests.length"
            class="space-y-3"
          >
            <AskCard
              v-for="request in interactiveRequests"
              :key="request.id"
              :request="request"
              @dismiss="emit('dismissAsk', request.id)"
              @submit="emit('submitAsk', request.id, $event)"
            />
          </div>
        </template>
      </div>
    </ScrollArea>
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="showJumpToBottom"
        class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
      >
        <Button
          size="icon"
          variant="outline"
          class="size-8 rounded-full shadow-lg"
          @click="scrollToBottom()"
        >
          <ArrowDown class="size-4" />
        </Button>
      </div>
    </transition>
  </div>
</template>
