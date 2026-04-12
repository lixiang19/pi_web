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
  ChatMessage,
  ContentBlock,
  ToolCallContentBlock,
  ToolResultContentBlock,
} from "@/lib/types";

const props = defineProps<{
  messages: ChatMessage[];
}>();

type ProcessEntry = {
  key: string;
  tag: string;
  summary: string;
  blocks: ContentBlock[];
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

const getToolPath = (block: ToolCallContentBlock) => {
  const value = block.arguments?.path;
  return typeof value === "string" && value.trim() ? value.trim() : "目标文件";
};

const getToolSummary = (name: string, block: ToolCallContentBlock | ToolResultContentBlock) => {
  switch (name) {
    case "bash": {
      const command = "arguments" in block ? block.arguments?.command : undefined;
      return typeof command === "string" && command.trim()
        ? `运行了命令：${command.trim().slice(0, 60)}`
        : "运行了命令";
    }
    case "read":
      return `读取了 ${"arguments" in block ? getToolPath(block as ToolCallContentBlock) : "文件"}`;
    case "write":
    case "edit":
      return `修改了 ${"arguments" in block ? getToolPath(block as ToolCallContentBlock) : "文件"}`;
    case "find":
      return "查找了文件";
    case "grep":
      return "搜索了内容";
    case "ls":
      return "查看了目录";
    case "ask":
      return "发起了提问";
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
        summary: getToolSummary(block.name || "工具", block),
      };
    case "toolResult":
      return {
        tag: "工具",
        summary: getToolSummary(block.name || "工具", block),
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

const processEntries = computed<ProcessEntry[]>(() =>
  props.messages.map((message, index) => {
    const blocks = getMessageBlocks(message);
    const primary = getPrimaryBlock(blocks);
    const { tag, summary } = summarizeBlock(primary);

    return {
      key: `${message.timestamp || index}-${index}`,
      tag,
      summary,
      blocks,
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
      return block.result instanceof Error ? AlertCircle : Check;
    case "image":
      return ImageIcon;
    default:
      return Sparkles;
  }
};

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

            <Markdown
              v-if="block.type === 'text'"
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
            >{{ stringifyResult(block.result) || '无输出' }}</pre>

            <img
              v-else-if="block.type === 'image'"
              :src="`data:${block.mimeType || 'image/png'};base64,${block.data || ''}`"
              alt=""
              class="max-w-full rounded-md"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </CollapsibleContent>
  </Collapsible>
</template>
