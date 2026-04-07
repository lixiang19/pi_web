<script setup lang="ts">
import {
  Wrench,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
} from "lucide-vue-next";
import { ref, computed } from "vue";
import type { ToolCallContentBlock, ToolResultContentBlock } from "@/lib/types";

const props = defineProps<{
  block: ToolCallContentBlock | ToolResultContentBlock;
  isResult?: boolean;
}>();

const isExpanded = ref(false);
const isToolCall = computed(() => props.block.type === "toolCall");

const toolName = computed(() => {
  if (isToolCall.value) {
    return (props.block as ToolCallContentBlock).name;
  }
  return (props.block as ToolResultContentBlock).toolName;
});

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div
    class="rounded-2xl border backdrop-blur-sm"
    :class="
      isResult
        ? (block as ToolResultContentBlock).isError
          ? 'border-red-400/20 bg-red-500/5'
          : 'border-emerald-400/20 bg-emerald-500/5'
        : 'border-sky-400/20 bg-sky-500/5'
    "
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-4 py-3 text-left transition"
      :class="
        isResult
          ? (block as ToolResultContentBlock).isError
            ? 'hover:bg-red-500/10'
            : 'hover:bg-emerald-500/10'
          : 'hover:bg-sky-500/10'
      "
      @click="toggleExpand"
    >
      <component
        :is="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? AlertCircle
              : Check
            : Wrench
        "
        class="size-4"
        :class="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? 'text-red-400'
              : 'text-emerald-400'
            : 'text-sky-400'
        "
      />
      <span
        class="text-xs font-medium"
        :class="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? 'text-red-300'
              : 'text-emerald-300'
            : 'text-sky-300'
        "
      >
        {{ isResult ? "工具执行结果" : "调用工具" }}: {{ toolName }}
      </span>
      <span
        class="ml-auto text-[10px] opacity-60"
        :class="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? 'text-red-400'
              : 'text-emerald-400'
            : 'text-sky-400'
        "
      >
        {{ isExpanded ? "收起" : "展开" }}
      </span>
      <component
        :is="isExpanded ? ChevronUp : ChevronDown"
        class="size-4 opacity-60"
        :class="
          isResult
            ? (block as ToolResultContentBlock).isError
              ? 'text-red-400'
              : 'text-emerald-400'
            : 'text-sky-400'
        "
      />
    </button>

    <div
      v-show="isExpanded"
      class="border-t px-4 py-3"
      :class="
        isResult
          ? (block as ToolResultContentBlock).isError
            ? 'border-red-400/10'
            : 'border-emerald-400/10'
          : 'border-sky-400/10'
      "
    >
      <!-- Tool Call 参数 -->
      <div v-if="isToolCall" class="space-y-2">
        <p
          class="text-[10px] uppercase tracking-wider opacity-60"
          :class="
            isResult
              ? (block as ToolResultContentBlock).isError
                ? 'text-red-400'
                : 'text-emerald-400'
              : 'text-sky-400'
          "
        >
          参数
        </p>
        <pre
          class="rounded-lg bg-black/30 px-3 py-2 text-xs font-mono overflow-x-auto"
          :class="
            isResult
              ? (block as ToolResultContentBlock).isError
                ? 'text-red-200/80'
                : 'text-emerald-200/80'
              : 'text-sky-200/80'
          "
          >{{
            JSON.stringify((block as ToolCallContentBlock).arguments, null, 2)
          }}</pre
        >
      </div>

      <!-- Tool Result 内容 -->
      <div v-else class="space-y-2">
        <p
          class="text-[10px] uppercase tracking-wider opacity-60 text-emerald-400"
        >
          结果
        </p>
        <div
          v-for="(contentBlock, index) in (block as ToolResultContentBlock)
            .content"
          :key="index"
        >
          <pre
            v-if="contentBlock.type === 'text'"
            class="max-h-64 overflow-auto rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-emerald-200/80"
            >{{ contentBlock.text }}</pre
          >
          <img
            v-else-if="contentBlock.type === 'image'"
            :src="`data:${contentBlock.mimeType};base64,${contentBlock.data}`"
            class="max-w-full rounded-lg border border-emerald-400/20"
            alt="Tool result image"
          />
        </div>
      </div>
    </div>
  </div>
</template>
