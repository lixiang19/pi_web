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
  <div class="relative flex-1 overflow-hidden">
    <Conversation class="h-full">
      <ConversationContent
        ref="conversationRef"
        class="h-full overflow-y-auto p-4 space-y-4"
        @scroll="handleScroll"
      >
        <!-- Loading indicator for older messages -->
        <div
          v-if="isLoadingOlder"
          class="flex justify-center py-2 text-sm text-muted-foreground"
        >
          <span>Loading older messages...</span>
        </div>

        <!-- Load more trigger -->
        <div
          v-else-if="hasMoreAbove && !isLoadingOlder"
          class="flex justify-center py-2"
        >
          <Button
            variant="ghost"
            size="sm"
            @click="emit('loadEarlier')"
          >
            Load more
          </Button>
        </div>

        <!-- Messages -->
        <AiElementsMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :is-streaming="isStreaming && message === messages[messages.length - 1]"
        />

        <!-- Empty state -->
        <div
          v-if="messages.length === 0"
          class="flex flex-col items-center justify-center h-full text-muted-foreground"
        >
          <p>No messages yet</p>
          <p class="text-sm">Start a conversation...</p>
        </div>
      </ConversationContent>

      <!-- Scroll to bottom button -->
      <ConversationScrollButton
        v-if="showJumpToBottom"
        class="absolute bottom-4 right-4"
      >
        <Button
          variant="secondary"
          size="icon"
          class="rounded-full shadow-lg"
          @click="scrollToBottom(true)"
        >
          <ArrowDown class="h-4 w-4" />
        </Button>
      </ConversationScrollButton>
    </Conversation>
  </div>
</template>
