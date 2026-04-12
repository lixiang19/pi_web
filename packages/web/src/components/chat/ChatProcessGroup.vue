<script setup lang="ts">
import { computed } from "vue";
import {
  AlertCircle,
  Brain,
  Check,
  ChevronDown,
  ImageIcon,
  Sparkles,
  Wrench,
} from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import type {
  AskQuestion,
  AskToolCallArguments,
  AskToolResultDetails,
  ChatMessage,
  ContentBlock,
  ToolCallContentBlock,
} from "@/lib/types";

const props = defineProps<{
  messages: ChatMessage[];
}>();

type ProcessEntry = {
  key: string;
  tag: string;
  summary: string;
  blocks: ContentBlock[];
  message: ChatMessage;
};

const TEXT_SUMMARIES = [
  "摸鱼侦查中",
  "翻箱倒柜中",
  "东翻西找中",
  "顺藤摸瓜中",
  "到处扒拉中",
  "线索搜集中",
];

const getMessageBlocks = (message: ChatMessage): ContentBlock[] =>
  typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : message.content;

const getPrimaryBlock = (blocks: ContentBlock[]) => blocks[0] || { type: "text", text: "" };

const pickRandomTextSummary = () =>
  TEXT_SUMMARIES[Math.floor(Math.random() * TEXT_SUMMARIES.length)] || "翻找中";

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const formatValueList = (values: string[]) => values.filter(Boolean).join("、");

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

const getToolBlockResult = (block: ContentBlock) =>
  block.type === "toolResult" ? block.result : undefined;

const getToolPath = (block: ToolCallContentBlock) => {
  const value = block.arguments?.path;
  return typeof value === "string" && value.trim() ? value.trim() : "目标文件";
};

const getAskToolCallArguments = (
  block: ContentBlock,
): AskToolCallArguments | null => {
  if (block.type !== "toolCall" || block.name !== "ask") {
    return null;
  }

  const args = block.arguments;
  if (!args || typeof args !== "object") {
    return null;
  }

  const questions = (args as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) {
    return null;
  }

  return {
    title: normalizeString((args as Record<string, unknown>).title) || undefined,
    message: normalizeString((args as Record<string, unknown>).message) || undefined,
    questions: questions as AskQuestion[],
  };
};

const getAskQuestionSummary = (questions: AskQuestion[]) => {
  const firstQuestion = normalizeString(questions[0]?.question);
  if (!firstQuestion) {
    return "发起了提问";
  }
  if (questions.length === 1) {
    return `提问：${firstQuestion}`;
  }
  return `提问：${firstQuestion} 等 ${questions.length} 个问题`;
};

const getToolCallSummary = (name: string, block: ToolCallContentBlock) => {
  if (name === "ask") {
    const askArgs = getAskToolCallArguments(block);
    return askArgs ? getAskQuestionSummary(askArgs.questions) : "发起了提问";
  }

  switch (name) {
    case "bash": {
      const command = block.arguments?.command;
      return typeof command === "string" && command.trim()
        ? `运行了命令：${command.trim().slice(0, 60)}`
        : "运行了命令";
    }
    case "read":
      return `读取了 ${getToolPath(block)}`;
    case "write":
    case "edit":
      return `修改了 ${getToolPath(block)}`;
    case "find":
      return "查找了文件";
    case "grep":
      return "搜索了内容";
    case "ls":
      return "查看了目录";
    case "request_execution":
      return "申请了执行";
    case "workflow_update_stage":
      return "更新了阶段";
    case "workflow_record_evidence":
      return "记录了证据";
    case "workflow_archive":
      return "归档了流程";
    case "request_smart_model":
      return "请求切换更强模型";
    case "Agent":
      return "启动了子代理";
    case "get_subagent_result":
      return "读取了子代理结果";
    case "steer_subagent":
      return "调整了子代理方向";
    case "code_reasoning":
      return "做了思考";
    case "mcp":
      return "调用了外部能力";
    case "handoff":
      return "发起了会话交接";
    default:
      return `调用了 ${name || "工具"}`;
  }
};

const getAskToolResultDetails = (
  message: ChatMessage,
): AskToolResultDetails | null => {
  if (message.role !== "toolResult" || message.toolName !== "ask") {
    return null;
  }
  const details = message.details;
  if (!details || typeof details !== "object") {
    return null;
  }

  const request = (details as Record<string, unknown>).request;
  const answers = (details as Record<string, unknown>).answers;
  const dismissed = (details as Record<string, unknown>).dismissed;
  if (!request || typeof request !== "object" || !Array.isArray(answers) || typeof dismissed !== "boolean") {
    return null;
  }

  return details as AskToolResultDetails;
};

const getAskResultRows = (message: ChatMessage) => {
  const details = getAskToolResultDetails(message);
  if (!details) {
    return [] as Array<{ question: AskQuestion; values: string[] }>;
  }

  const answerMap = new Map(
    details.answers.map((answer) => [answer.questionId, answer.values]),
  );

  return details.request.questions.map((question) => ({
    question,
    values: answerMap.get(question.id) || [],
  }));
};

const getAskResultSummary = (message: ChatMessage) => {
  const details = getAskToolResultDetails(message);
  if (!details) {
    return "ask 已返回结果";
  }
  if (details.dismissed) {
    return "提问已取消";
  }

  const firstAnswered = details.answers.find((answer) => answer.values.length > 0);
  if (!firstAnswered) {
    return "已回答问题";
  }

  const preview = formatValueList(firstAnswered.values);
  if (details.answers.length === 1) {
    return preview ? `已回答：${preview}` : "已回答 1 个问题";
  }
  return preview
    ? `已回答 ${details.answers.length} 个问题 · ${preview}`
    : `已回答 ${details.answers.length} 个问题`;
};

const getToolResultSummary = (message: ChatMessage) => {
  if (message.toolName === "ask") {
    return getAskResultSummary(message);
  }

  const text = getMessageBlocks(message)
    .filter((block): block is { type: "text"; text?: string } => block.type === "text")
    .map((block) => normalizeString(block.text))
    .find(Boolean);

  if (text) {
    return `${message.toolName || "工具"} · ${text.slice(0, 50)}`;
  }

  return `${message.toolName || "工具"} 已返回结果`;
};

const summarizeBlock = (block: ContentBlock): { tag: string; summary: string } => {
  switch (block.type) {
    case "text":
      return {
        tag: "文字",
        summary: pickRandomTextSummary(),
      };
    case "thinking":
      return {
        tag: "思考",
        summary: "虾时思考",
      };
    case "toolCall":
      return {
        tag: "工具",
        summary: getToolCallSummary(block.name || "工具", block),
      };
    case "toolResult":
      return {
        tag: "工具",
        summary: block.name ? `${block.name} 已返回结果` : "工具已返回结果",
      };
    case "image":
      return {
        tag: "图片",
        summary: "返回了图片",
      };
    default:
      return {
        tag: "过程",
        summary: "执行中",
      };
  }
};

const summarizeMessage = (message: ChatMessage) => {
  if (message.role === "toolResult") {
    return {
      tag: "工具",
      summary: getToolResultSummary(message),
    };
  }

  return summarizeBlock(getPrimaryBlock(getMessageBlocks(message)));
};

const processEntries = computed<ProcessEntry[]>(() =>
  props.messages.map((message, index) => {
    const blocks = getMessageBlocks(message);
    const { tag, summary } = summarizeMessage(message);

    return {
      key:
        message.toolCallId ||
        `${message.timestamp || index}-${message.role}-${message.toolName || index}`,
      tag,
      summary,
      blocks,
      message,
    };
  }),
);

const groupTitle = computed(() => processEntries.value.at(-1)?.summary || "执行过程");

const blockIcon = (block: ContentBlock) => {
  switch (block.type) {
    case "thinking":
      return Brain;
    case "toolCall":
      return Wrench;
    case "toolResult":
      return Check;
    case "image":
      return ImageIcon;
    default:
      return Sparkles;
  }
};

const getToolResultIcon = (message: ChatMessage) =>
  message.isError ? AlertCircle : Check;

const hasToolResultText = (message: ChatMessage) =>
  getMessageBlocks(message).some(
    (block) => block.type === "text" && Boolean(normalizeString(block.text)),
  );
</script>

<template>
  <Collapsible class="text-muted-foreground/80">
    <CollapsibleTrigger
      class="flex w-fit max-w-full items-center gap-2 py-0.5 text-left transition-colors hover:text-foreground/90"
    >
      <Sparkles class="size-3.5 shrink-0" />
      <span class="truncate text-sm">
        {{ groupTitle }}
      </span>
      <ChevronDown class="size-3.5 shrink-0" />
    </CollapsibleTrigger>

    <CollapsibleContent class="mt-1 space-y-0.5 pl-5">
      <Collapsible
        v-for="entry in processEntries"
        :key="entry.key"
        class="text-muted-foreground/70"
      >
        <CollapsibleTrigger
          class="flex w-full items-center gap-2 py-0.5 text-left text-xs transition-colors hover:text-foreground/80"
        >
          <Badge variant="outline" class="h-5 rounded-md px-1.5 text-[10px]">
            {{ entry.tag }}
          </Badge>
          <span class="truncate">{{ entry.summary }}</span>
          <ChevronDown class="size-3 shrink-0" />
        </CollapsibleTrigger>

        <CollapsibleContent class="space-y-2 py-1">
          <div
            v-if="entry.message.role === 'toolResult'"
            class="ridge-panel-inset rounded-md px-2 py-2 text-xs leading-5 text-foreground/75"
          >
            <div class="mb-1 flex items-center gap-1.5 text-muted-foreground/70">
              <component :is="getToolResultIcon(entry.message)" class="size-3.5 shrink-0" />
              <span class="text-[11px]">
                {{ entry.message.toolName || 'toolResult' }}
              </span>
            </div>

            <div
              v-if="entry.message.toolName === 'ask' && getAskToolResultDetails(entry.message)"
              class="space-y-3"
            >
              <div class="space-y-1">
                <p class="text-sm font-medium text-foreground">
                  {{ getAskToolResultDetails(entry.message)?.request.title || '提问结果' }}
                </p>
                <p
                  v-if="getAskToolResultDetails(entry.message)?.request.message"
                  class="text-xs text-muted-foreground"
                >
                  {{ getAskToolResultDetails(entry.message)?.request.message }}
                </p>
              </div>

              <div
                v-if="getAskToolResultDetails(entry.message)?.dismissed"
                class="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground"
              >
                用户取消了这次提问
              </div>

              <div
                v-for="row in getAskResultRows(entry.message)"
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
                  {{ row.values.length ? formatValueList(row.values) : '未回答' }}
                </p>
              </div>
            </div>

            <template v-else>
              <template v-for="(block, index) in entry.blocks" :key="`${entry.key}-tool-result-text-${index}`">
                <Markdown
                  v-if="block.type === 'text'"
                  :content="block.text || ''"
                  class="max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                />
              </template>

              <pre
                v-if="entry.message.details && !hasToolResultText(entry.message)"
                class="whitespace-pre-wrap break-words font-mono"
              >{{ stringifyResult(entry.message.details) || '无输出' }}</pre>
            </template>
          </div>

          <template v-else>
            <div
              v-for="(block, index) in entry.blocks"
              :key="`${entry.key}-${index}`"
              class="ridge-panel-inset rounded-md px-2 py-2 text-xs leading-5 text-foreground/75"
            >
              <div class="mb-1 flex items-center gap-1.5 text-muted-foreground/70">
                <component :is="blockIcon(block)" class="size-3.5 shrink-0" />
                <span class="text-[11px]">
                  {{ block.type }}
                </span>
              </div>

              <template v-if="block.type === 'toolCall' && getAskToolCallArguments(block)">
                <div class="space-y-3">
                  <div class="space-y-1">
                    <p class="text-sm font-medium text-foreground">
                      {{ getAskToolCallArguments(block)?.title || '需要回答的问题' }}
                    </p>
                    <p
                      v-if="getAskToolCallArguments(block)?.message"
                      class="text-xs text-muted-foreground"
                    >
                      {{ getAskToolCallArguments(block)?.message }}
                    </p>
                  </div>

                  <div
                    v-for="question in getAskToolCallArguments(block)?.questions || []"
                    :key="question.id"
                    class="rounded-md border border-border/60 bg-background/70 px-3 py-2"
                  >
                    <p class="text-sm font-medium text-foreground">
                      {{ question.question }}
                    </p>
                    <p
                      v-if="question.description"
                      class="mt-1 text-xs text-muted-foreground"
                    >
                      {{ question.description }}
                    </p>
                    <ul
                      v-if="question.options?.length"
                      class="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground"
                    >
                      <li v-for="option in question.options" :key="option.label">
                        <span class="text-foreground">{{ option.label }}</span>
                        <span v-if="option.description"> · {{ option.description }}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>

              <Markdown
                v-else-if="block.type === 'text'"
                :content="block.text || ''"
                class="max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />

              <pre
                v-else-if="block.type === 'thinking'"
                class="whitespace-pre-wrap break-words font-mono"
              >{{ block.redacted ? '思考内容已隐藏' : (block.thinking || '') }}</pre>

              <pre
                v-else-if="block.type === 'toolCall'"
                class="whitespace-pre-wrap break-words font-mono"
              >{{ JSON.stringify(block.arguments || {}, null, 2) }}</pre>

              <pre
                v-else-if="block.type === 'toolResult'"
                class="whitespace-pre-wrap break-words font-mono"
              >{{ stringifyResult(getToolBlockResult(block)) || '无输出' }}</pre>

              <img
                v-else-if="block.type === 'image'"
                :src="`data:${block.mimeType || 'image/png'};base64,${block.data || ''}`"
                alt=""
                class="max-w-full rounded-md"
              />
            </div>
          </template>
        </CollapsibleContent>
      </Collapsible>
    </CollapsibleContent>
  </Collapsible>
</template>
