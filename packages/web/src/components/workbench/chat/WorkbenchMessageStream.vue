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

const COLLAPSED_ROUND_WINDOW = 3;
const EXPAND_ROUND_STEP = 3;

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
const visibleRoundCount = ref(COLLAPSED_ROUND_WINDOW);

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

const getUserMessageIndexes = (messages: ChatMessage[]) =>
  messages.reduce<number[]>((indexes, message, index) => {
    if (message.role === "user") {
      indexes.push(index);
    }
    return indexes;
  }, []);

const userMessageIndexes = computed(() => getUserMessageIndexes(props.messages));
const loadedRoundCount = computed(() => userMessageIndexes.value.length);
const collapsedRoundCount = computed(() =>
  Math.min(COLLAPSED_ROUND_WINDOW, loadedRoundCount.value || COLLAPSED_ROUND_WINDOW),
);
const hiddenLoadedRoundCount = computed(() =>
  Math.max(loadedRoundCount.value - visibleRoundCount.value, 0),
);
const canExpandEarlierRounds = computed(() => hiddenLoadedRoundCount.value > 0);
const canCollapseHistory = computed(
  () => visibleRoundCount.value > collapsedRoundCount.value,
);

const recentRoundStartIndex = computed(() => {
  const indexes = userMessageIndexes.value;
  if (indexes.length === 0) {
    return 0;
  }

  const startRoundIndex = Math.max(0, indexes.length - visibleRoundCount.value);
  return startRoundIndex === 0 ? 0 : indexes[startRoundIndex]!;
});

const preserveScrollWhile = async (updater: () => void | Promise<void>) => {
  const viewport = resolveMessageViewport();
  const previousHeight = viewport?.scrollHeight ?? 0;
  const previousTop = viewport?.scrollTop ?? 0;

  await updater();
  await nextTick();

  if (viewport) {
    const heightDelta = viewport.scrollHeight - previousHeight;
    viewport.scrollTop = previousTop + heightDelta;
  }

  syncScrollState();
};

const expandEarlierRounds = async () => {
  if (!canExpandEarlierRounds.value) {
    return;
  }

  await preserveScrollWhile(() => {
    visibleRoundCount.value = Math.min(
      loadedRoundCount.value,
      visibleRoundCount.value + EXPAND_ROUND_STEP,
    );
  });
};

const collapseHistory = async () => {
  if (!canCollapseHistory.value) {
    return;
  }

  visibleRoundCount.value = collapsedRoundCount.value;
  await nextTick();
  syncScrollState();
};

const conversationLayout = computed(() => {
  const rounds: MessageRound[] = [];
  const allMessages = props.messages;
  const startIndex = recentRoundStartIndex.value;
  const alignedMessages = startIndex >= 0 ? allMessages.slice(startIndex) : allMessages;
  const preludeMessages =
    alignedMessages.length > 0 && alignedMessages[0]?.role !== "user"
      ? alignedMessages
      : ([] as ChatMessage[]);

  let cursor = preludeMessages.length;
  while (cursor < alignedMessages.length) {
    const userMessage = alignedMessages[cursor];
    if (!userMessage || userMessage.role !== "user") {
      cursor += 1;
      continue;
    }

    let nextUserIndex = cursor + 1;
    while (
      nextUserIndex < alignedMessages.length &&
      alignedMessages[nextUserIndex]?.role !== "user"
    ) {
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

const lastMessageContentKey = computed(() => {
  const lastMessage = props.messages.at(-1);
  if (!lastMessage) {
    return "";
  }

  if (typeof lastMessage.content === "string") {
    return `${lastMessage.localId || ""}:${lastMessage.timestamp || 0}:${lastMessage.content.length}`;
  }

  const blockLengths = lastMessage.content.map((block) => {
    if (block.type === "text") {
      return block.text?.length || 0;
    }
    if (block.type === "thinking") {
      return block.thinking?.length || 0;
    }
    return 0;
  });

  return `${lastMessage.localId || ""}:${lastMessage.timestamp || 0}:${lastMessage.content.length}:${blockLengths.join(",")}`;
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
  await preserveScrollWhile(async () => {
    emit("loadEarlier");
  });
};

watch(
  () => props.activeSessionId,
  async () => {
    visibleRoundCount.value = COLLAPSED_ROUND_WINDOW;
    await bindMessageViewport();
    scrollToBottom("auto");
  },
);

watch(
  () => props.activeDraftParentSessionId,
  async () => {
    visibleRoundCount.value = COLLAPSED_ROUND_WINDOW;
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
  lastMessageContentKey,
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
          <div
            v-if="canExpandEarlierRounds || canCollapseHistory || hasMoreAbove"
            class="flex flex-wrap items-center justify-center gap-2 pb-4"
          >
            <Button
              v-if="canExpandEarlierRounds"
              variant="ghost"
              size="sm"
              class="h-7 text-xs"
              @click="expandEarlierRounds"
            >
              {{ `展开更早 ${Math.min(EXPAND_ROUND_STEP, hiddenLoadedRoundCount)} 轮` }}
            </Button>
            <Button
              v-if="canCollapseHistory"
              variant="ghost"
              size="sm"
              class="h-7 text-xs"
              @click="collapseHistory"
            >
              折叠旧轮次
            </Button>
            <Button
              v-if="hasMoreAbove"
              variant="ghost"
              size="sm"
              class="h-7 text-xs"
              :disabled="isLoadingOlder"
              @click="loadEarlierMessages"
            >
              {{ isLoadingOlder ? "加载中..." : "加载更早历史" }}
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
