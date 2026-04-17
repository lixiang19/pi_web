<script setup lang="ts">
import { computed, ref } from "vue";
import { AlertCircle, Check, ChevronDown } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  AskQuestion,
  PiTextContent,
  PiToolResultMessage,
} from "@/lib/types";
import { getAskToolResultDetails } from "@/lib/conversation";

const props = defineProps<{
  message: PiToolResultMessage;
}>();

const isExpanded = ref(false);

const askDetails = computed(() => getAskToolResultDetails(props.message));

const stringifyResult = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatValueList = (values: string[]) => values.filter(Boolean).join("、");

const getAskResultRows = () => {
  if (!askDetails.value) {
    return [] as Array<{ question: AskQuestion; values: string[] }>;
  }

  const answerMap = new Map(
    askDetails.value.answers.map((answer) => [answer.questionId, answer.values]),
  );

  return askDetails.value.request.questions.map((question) => ({
    question,
    values: answerMap.get(question.id) || [],
  }));
};

const textContents = computed<PiTextContent[]>(() =>
  props.message.content.filter(
    (content): content is PiTextContent =>
      content.type === "text" && Boolean(content.text.trim()),
  ),
);

const hasTextContent = computed(() => textContents.value.length > 0);
</script>

<template>
  <Collapsible v-model:open="isExpanded" class="text-muted-foreground/70">
    <CollapsibleTrigger
      class="flex w-full items-center gap-1.5 py-0.5 text-left text-xs transition-colors hover:text-foreground/80"
    >
      <component :is="message.isError ? AlertCircle : Check" class="size-3.5 shrink-0" />
      <span class="truncate">工具结果 · {{ message.toolName || "工具" }}</span>
      <ChevronDown
        class="size-3 shrink-0 transition-transform duration-200"
        :class="isExpanded ? 'rotate-180' : ''"
      />
    </CollapsibleTrigger>

    <CollapsibleContent class="py-1">
      <div class="ridge-panel-inset rounded-md px-2 py-2 text-xs leading-5 text-foreground/75">
        <div
          v-if="askDetails"
          class="space-y-3"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              {{ askDetails.request.title || "提问结果" }}
            </p>
            <p
              v-if="askDetails.request.message"
              class="text-xs text-muted-foreground"
            >
              {{ askDetails.request.message }}
            </p>
          </div>

          <div
            v-if="askDetails.dismissed"
            class="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground"
          >
            用户取消了这次提问
          </div>

          <div
            v-for="row in getAskResultRows()"
            :key="row.question.id"
            class="rounded-md border border-border/60 bg-background/70 px-3 py-2"
          >
            <p class="text-sm font-medium text-foreground">
              {{ row.question.question }}
            </p>
            <p
              v-if="row.question.description"
              class="mt-1 text-xs text-muted-foreground"
            >
              {{ row.question.description }}
            </p>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ row.values.length ? formatValueList(row.values) : "未回答" }}
            </p>
          </div>
        </div>

        <template v-else>
          <Markdown
            v-for="(content, index) in textContents"
            :key="`tool-result-text-${index}`"
            :content="content.text"
            class="max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          />

          <pre
            v-if="message.details && !hasTextContent"
            class="whitespace-pre-wrap break-words font-mono"
          >{{ stringifyResult(message.details) || "无输出" }}</pre>
        </template>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
