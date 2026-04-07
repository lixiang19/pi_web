<script setup lang="ts">
import { ChevronDown, ChevronUp, Brain } from "lucide-vue-next";
import { ref } from "vue";
import type { ThinkingContentBlock } from "@/lib/types";

defineProps<{
  block: ThinkingContentBlock;
}>();

const isExpanded = ref(false);

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};
</script>

<template>
  <div
    class="rounded-2xl border border-amber-400/20 bg-amber-500/5 backdrop-blur-sm"
  >
    <button
      type="button"
      class="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-amber-500/10"
      @click="toggleExpand"
    >
      <Brain class="size-4 text-amber-400" />
      <span class="text-xs font-medium text-amber-300">
        {{ block.redacted ? "思考内容已编辑" : "思考过程" }}
      </span>
      <span class="ml-auto text-[10px] text-amber-400/60">
        {{ isExpanded ? "收起" : "展开" }}
      </span>
      <component
        :is="isExpanded ? ChevronUp : ChevronDown"
        class="size-4 text-amber-400/60"
      />
    </button>

    <div v-show="isExpanded" class="border-t border-amber-400/10 px-4 py-3">
      <p v-if="block.redacted" class="text-xs italic text-amber-400/60">
        此思考内容已被安全过滤器编辑。
      </p>
      <p
        v-else
        class="whitespace-pre-wrap text-xs leading-5 text-amber-200/80 font-mono"
      >
        {{ block.thinking }}
      </p>
    </div>
  </div>
</template>
