<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowDown, Brain } from "lucide-vue-next";

import ChatMessageItem from "@/components/chat/ChatMessageItem.vue";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage, SessionSummary } from "@/lib/types";

const props = defineProps<{
  activeDraftParentSessionId?: string | undefined;
  activeSessionId: string;
  hasMoreAbove: boolean;
  isDraftSession: boolean;
  isLoadingOlder: boolean;
  messages: ChatMessage[];
  status: SessionSummary["status"];
}>();

const emit = defineEmits<{
  loadEarlier: [];
}>();

const messageScrollArea = ref<HTMLElement | { $el?: Element } | null>(null);
const showJumpToBottom = ref(false);
const isPinnedToBottom = ref(true);

let boundMessageViewport: HTMLElement | null = null;

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
    await bindMessageViewport();
    scrollToBottom("auto");
  },
);

watch(
  () => props.activeDraftParentSessionId,
  async () => {
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
  () => props.messages.at(-1)?.text || "",
  async () => {
    await nextTick();
    if (isPinnedToBottom.value || props.status === "streaming") {
      scrollToBottom(props.status === "streaming" ? "auto" : "smooth");
      return;
    }

    syncScrollState();
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
      <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <div
          v-if="messages.length === 0"
          class="flex flex-col items-center justify-center gap-4 py-20 text-center"
        >
          <div class="rounded-full border border-border p-4 text-muted-foreground">
            <Brain class="size-8" />
          </div>
          <div class="space-y-1">
            <h3 class="text-lg font-semibold text-foreground">
              {{ isDraftSession ? "New Session" : "No Messages" }}
            </h3>
            <p class="mx-auto max-w-xs text-sm text-muted-foreground">
              Type a message to start the conversation, or use "/" for commands.
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
              {{ isLoadingOlder ? "Loading..." : "Load earlier messages" }}
            </Button>
          </div>
          <ChatMessageItem
            v-for="message in messages"
            :key="message.id"
            :message="message"
          />
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
