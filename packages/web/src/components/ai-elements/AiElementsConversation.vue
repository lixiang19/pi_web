<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount, computed } from "vue";
import { ArrowDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import AiElementsMessage from "./AiElementsMessage.vue";

// Import ai-elements-vue conversation components
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";

interface Props {
  messages: ChatMessage[];
  sessionId: string | null;
  hasMoreAbove?: boolean;
  isLoadingOlder?: boolean;
  isStreaming?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hasMoreAbove: false,
  isLoadingOlder: false,
  isStreaming: false,
});

const emit = defineEmits<{
  loadEarlier: [];
  scrollToBottom: [];
}>();

const conversationRef = ref<HTMLElement | null>(null);
const showJumpToBottom = ref(false);
const isPinnedToBottom = ref(true);
const lastMessageCount = ref(0);

// Track if user is at bottom
const checkScrollPosition = () => {
  const container = conversationRef.value;
  if (!container) return;

  const scrollTop = container.scrollTop;
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;

  // Consider "at bottom" if within 100px of bottom
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
  isPinnedToBottom.value = isAtBottom;
  showJumpToBottom.value = !isAtBottom && props.messages.length > 0;
};

// Scroll to bottom
const scrollToBottom = (smooth = false) => {
  const container = conversationRef.value;
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
  isPinnedToBottom.value = true;
  showJumpToBottom.value = false;
};

// Handle scroll events
const handleScroll = () => {
  const container = conversationRef.value;
  if (!container) return;

  checkScrollPosition();

  // Load older messages when scrolling near top
  if (container.scrollTop < 100 && props.hasMoreAbove && !props.isLoadingOlder) {
    emit("loadEarlier");
  }
};

// Watch for new messages and auto-scroll if pinned
watch(
  () => props.messages.length,
  (newCount, oldCount) => {
    if (newCount > oldCount) {
      // New message added
      if (isPinnedToBottom.value) {
        nextTick(() => scrollToBottom(true));
      } else {
        showJumpToBottom.value = true;
      }
    }
    lastMessageCount.value = newCount;
  },
);

// Watch for streaming state changes
watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming && isPinnedToBottom.value) {
      nextTick(() => scrollToBottom(false));
    }
  },
);

// Initial scroll to bottom
onMounted(() => {
  nextTick(() => scrollToBottom(false));
  lastMessageCount.value = props.messages.length;
});

// Expose scroll method for parent
defineExpose({
  scrollToBottom,
  checkScrollPosition,
});
</script>

<template>
  <div class="relative flex-1 overflow-hidden bg-background">
    <Conversation class="h-full" aria-label="对话消息列表">
      <ConversationContent
        ref="conversationRef"
        class="h-full overflow-y-auto scroll-smooth p-4 space-y-6"
        @scroll="handleScroll"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        <!-- Loading indicator for older messages -->
        <div
          v-if="isLoadingOlder"
          class="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"
        >
          <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <span>加载历史消息...</span>
        </div>

        <!-- Load more trigger -->
        <div
          v-else-if="hasMoreAbove && !isLoadingOlder"
          class="flex justify-center py-4"
        >
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground hover:text-foreground"
            @click="emit('loadEarlier')"
          >
            加载更多
          </Button>
        </div>

        <!-- Messages -->
        <AiElementsMessage
          v-for="(message, index) in messages"
          :key="message.id"
          :message="message"
          :is-streaming="isStreaming && index === messages.length - 1"
          tabindex="0"
        />

        <!-- Empty state -->
        <div
          v-if="messages.length === 0"
          class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
          role="status"
          aria-label="暂无消息"
        >
          <div class="rounded-full bg-muted/50 p-4">
            <svg class="h-6 w-6 text-muted-foreground/60" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p class="font-medium">暂无消息</p>
          <p class="text-sm text-muted-foreground/80">开始一段新的对话...</p>
        </div>
      </ConversationContent>

      <!-- Scroll to bottom button -->
      <ConversationScrollButton
        v-if="showJumpToBottom"
        class="absolute bottom-4 right-4 z-10"
      >
        <Button
          variant="secondary"
          size="icon"
          class="h-9 w-9 rounded-full shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
          aria-label="滚动到底部"
          @click="scrollToBottom(true)"
        >
          <ArrowDown class="h-4 w-4" />
        </Button>
      </ConversationScrollButton>
    </Conversation>
  </div>
</template>
