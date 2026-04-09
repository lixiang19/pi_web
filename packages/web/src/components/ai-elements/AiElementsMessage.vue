<script setup lang="ts">
import type { ChatMessage } from "@/lib/types";
import { computed } from "vue";
import {
  convertMessageToAiElements,
  getReasoningParts,
  getToolInvocations,
} from "@/lib/ai-elements-adapter";

// Import ai-elements-vue components
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "./message";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  ToolStatusBadge,
} from "./tool";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
}

const props = defineProps<Props>();

const aiMessage = computed(() => convertMessageToAiElements(props.message));

const reasoningParts = computed(() =>
  getReasoningParts(aiMessage.value),
);

const toolInvocations = computed(() =>
  getToolInvocations(aiMessage.value),
);

const textParts = computed(() =>
  aiMessage.value.parts.filter((p) => p.type === "text"),
);

function handleCopy() {
  const text = textParts.value.map((p) => p.text).join(" ");
  navigator.clipboard.writeText(text);
}
</script>

<template>
  <Message :from="message.role" class="w-full focus-within:outline-none">
    <MessageContent>
      <!-- Reasoning / Thinking -->
      <Reasoning
        v-for="(part, idx) in reasoningParts"
        :key="`reasoning-${idx}`"
        :is-streaming="isStreaming && idx === reasoningParts.length - 1"
        :default-open="true"
        class="mb-3"
      >
        <ReasoningTrigger />
        <ReasoningContent>
          <pre class="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm font-mono text-muted-foreground">{{ part.reasoning }}</pre>
        </ReasoningContent>
      </Reasoning>

      <!-- Text Content -->
      <MessageResponse
        v-for="(part, idx) in textParts"
        :key="`text-${idx}`"
        class="prose prose-sm dark:prose-invert max-w-none"
      >
        {{ part.text }}
      </MessageResponse>

      <!-- Tool Invocations -->
      <Tool
        v-for="(tool, idx) in toolInvocations"
        :key="`tool-${idx}`"
        class="my-3 overflow-hidden"
      >
        <ToolHeader>
          <ToolStatusBadge :state="tool.toolInvocation?.state ?? 'pending'" />
          <span class="font-medium text-sm">{{ tool.toolInvocation?.toolName }}</span>
        </ToolHeader>

        <ToolContent>
          <ToolInput v-if="tool.toolInvocation?.args">
            <pre class="rounded-md bg-muted/80 p-2 text-xs font-mono overflow-x-auto">{{ JSON.stringify(tool.toolInvocation.args, null, 2) }}</pre>
          </ToolInput>

          <ToolOutput v-if="tool.toolInvocation?.result">
            <pre v-if="typeof tool.toolInvocation.result === 'string'" class="rounded-md bg-muted/80 p-2 text-xs font-mono overflow-x-auto">{{ tool.toolInvocation.result }}</pre>
            <pre v-else class="rounded-md bg-muted/80 p-2 text-xs font-mono overflow-x-auto">{{ JSON.stringify(tool.toolInvocation.result, null, 2) }}</pre>
          </ToolOutput>
        </ToolContent>
      </Tool>
    </MessageContent>

    <!-- Actions -->
    <MessageActions v-if="message.role === 'assistant'" class="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <MessageAction tooltip="复制内容" label="复制" @click="handleCopy">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
      </MessageAction>
    </MessageActions>
  </Message>
</template>
