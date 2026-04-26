<script setup lang="ts">
import { h, ref } from "vue";
import { MessageSquarePlus } from "lucide-vue-next";
import {
  Markdown,
  type HardenOptions,
  type HtmlNodeRendererProps,
  type LinkOptions,
} from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import MarkdownAiComposer from "./MarkdownAiComposer.vue";
import type { WorkbenchMarkdownBlock } from "./types";

const props = defineProps<{
  block: WorkbenchMarkdownBlock;
  enableAiActions?: boolean;
}>();

const emit = defineEmits<{
  (e: "append-to-draft", payload: { block: WorkbenchMarkdownBlock; instruction: string }): void;
}>();

const isComposerOpen = ref(false);
const draftInstruction = ref("");

const markdownHardenOptions: HardenOptions = {
  allowedLinkPrefixes: [],
  allowedImagePrefixes: [],
  allowedProtocols: [],
  allowDataImages: false,
};

const markdownLinkOptions: LinkOptions = {
  safetyCheck: true,
  isTrusted: () => false,
};

const SafeHtmlNodeRenderer = (rendererProps: HtmlNodeRendererProps) => {
  return h("div", {
    class:
      "rounded-xl border border-border/50 bg-muted/40 px-4 py-3 text-left",
  }, [
    h("p", {
      class: "mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground",
    }, "原始 HTML 已按文本显示"),
    h("pre", {
      class: "overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground/90",
    }, rendererProps.node.value),
  ]);
};

const markdownNodeRenderers = {
  html: SafeHtmlNodeRenderer,
};

const appendToDraft = () => {
  emit("append-to-draft", {
    block: props.block,
    instruction: draftInstruction.value,
  });
  draftInstruction.value = "";
  isComposerOpen.value = false;
};

const closeComposer = () => {
  draftInstruction.value = "";
  isComposerOpen.value = false;
};
</script>

<template>
  <article class="group rounded-2xl border border-border/40 bg-card/70 px-4 py-4 shadow-sm transition-colors hover:border-border/70">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
          {{ props.block.kind }} · {{ props.block.startLine }}-{{ props.block.endLine }}
        </p>
        <p class="mt-1 truncate text-sm font-medium text-foreground/90">
          {{ props.block.title }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Popover v-if="props.enableAiActions !== false" v-model:open="isComposerOpen">
          <PopoverTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="size-7 opacity-0 transition-opacity group-hover:opacity-100">
              <MessageSquarePlus class="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-80">
            <MarkdownAiComposer
              v-model="draftInstruction"
              @cancel="closeComposer"
              @submit="appendToDraft"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <div class="markdown-preview-block max-w-none break-words text-sm leading-7 text-foreground/88 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:pointer-events-none [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-border/60 [&_blockquote]:pl-4 [&_code]:rounded-md [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_hr]:border-border/50 [&_img]:hidden [&_li]:marker:text-muted-foreground [&_ol]:pl-5 [&_p]:text-foreground/88 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/50 [&_pre]:bg-muted/60 [&_pre]:p-4 [&_table]:w-full [&_table]:border-collapse [&_tbody_tr]:border-t [&_tbody_tr]:border-border/40 [&_td]:border [&_td]:border-border/40 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border/40 [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_ul]:pl-5">
      <Markdown
        :content="props.block.source"
        :harden-options="markdownHardenOptions"
        :link-options="markdownLinkOptions"
        :node-renderers="markdownNodeRenderers"
      />
    </div>
  </article>
</template>
