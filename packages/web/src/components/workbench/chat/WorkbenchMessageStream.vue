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
      <div class="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-8 sm:px-12">
        <div
          v-if="messages.length === 0"
          class="flex min-h-[400px] flex-col items-center justify-center gap-6 text-center"
        >
          <div
            class="animate-pulse rounded-full border border-amber-400/20 bg-amber-500/10 p-6 text-amber-200 shadow-[0_0_40px_rgba(245,158,11,0.1)]"
          >
            <Brain class="size-12" />
          </div>
          <div class="space-y-4">
            <h3
              class="text-3xl font-black uppercase tracking-tighter text-stone-50"
            >
              {{ isDraftSession ? "Chamber Online" : "No Archives" }}
            </h3>
            <p
              class="mx-auto max-w-xs text-sm font-medium leading-relaxed text-stone-500"
            >
              Ready to execute. Start by describing your objective or trigger a
              command with "/".
            </p>
          </div>
        </div>

        <template v-else>
          <div v-if="hasMoreAbove" class="flex justify-center pb-8">
            <Button
              variant="ghost"
              size="sm"
              class="h-8 border border-white/5 bg-white/[0.02] text-[10px] font-bold uppercase tracking-widest text-stone-500 hover:text-stone-300"
              :disabled="isLoadingOlder"
              @click="loadEarlierMessages"
            >
              {{ isLoadingOlder ? "Syncing..." : "Retrieve Earlier Data" }}
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
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-4 scale-90 opacity-0"
      enter-to-class="translate-y-0 scale-100 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 scale-100 opacity-100"
      leave-to-class="translate-y-4 scale-90 opacity-0"
    >
      <div
        v-if="showJumpToBottom"
        class="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
      >
        <Button
          size="icon"
          class="size-10 rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-200 shadow-2xl backdrop-blur-md hover:bg-amber-500/20"
          @click="scrollToBottom()"
        >
          <ArrowDown class="size-5" />
        </Button>
      </div>
    </transition>
  </div>
</template>
