<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMutationObserver } from "@vueuse/core";
import { Code2, LoaderCircle } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createRidgeCodeTheme, highlightCodeToHtml } from "./codeHighlight";

const props = defineProps<{
  content: string;
  fileName: string;
  extension: string;
  mimeType: string;
}>();

const htmlElement = typeof document !== "undefined" ? document.documentElement : null;
const isDark = ref(htmlElement?.classList.contains("dark") ?? false);
const themeName = ref(htmlElement?.dataset["theme"] ?? "ridge");
const isHighlighting = ref(true);
const hasHighlightedHtml = ref(false);
const highlightError = ref("");
const highlightedHtml = ref("");
const languageLabel = ref("Plain Text");

let highlightRequestId = 0;

if (htmlElement) {
  useMutationObserver(
    htmlElement,
    () => {
      isDark.value = htmlElement.classList.contains("dark");
      themeName.value = htmlElement.dataset["theme"] ?? "ridge";
    },
    {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    },
  );
}

const ridgeTheme = computed(() => {
  if (!htmlElement) {
    return createRidgeCodeTheme({
      themeName: "ridge",
      isDark: isDark.value,
      styles: {
        getPropertyValue: () => "",
      },
    });
  }

  return createRidgeCodeTheme({
    themeName: themeName.value,
    isDark: isDark.value,
    styles: getComputedStyle(htmlElement),
  });
});

watch(
  () => [props.content, props.fileName, props.extension, props.mimeType, ridgeTheme.value.signature] as const,
  async ([content, fileName, extension, mimeType, themeSignature]) => {
    const requestId = ++highlightRequestId;
    isHighlighting.value = true;
    highlightError.value = "";

    try {
      const result = await highlightCodeToHtml({
        code: content,
        fileName,
        extension,
        mimeType,
        theme: ridgeTheme.value.theme,
        themeSignature,
      });

      if (requestId !== highlightRequestId) {
        return;
      }

      highlightedHtml.value = result.html;
      hasHighlightedHtml.value = Boolean(result.html);
      languageLabel.value = result.label;
    } catch (caughtError) {
      if (requestId !== highlightRequestId) {
        return;
      }

      highlightError.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      highlightedHtml.value = "";
      hasHighlightedHtml.value = false;
      languageLabel.value = "Plain Text";
    } finally {
      if (requestId === highlightRequestId) {
        isHighlighting.value = false;
      }
    }
  },
  { immediate: true },
);

const lineCount = computed(() => {
  if (!props.content) {
    return 1;
  }

  return props.content.split(/\r\n?|\n/).length;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div class="flex h-10 items-center justify-between gap-3 border-b border-border/40 px-3">
      <div class="flex min-w-0 items-center gap-2">
        <Code2 class="size-3.5 text-muted-foreground" />
        <span class="truncate text-xs font-semibold uppercase tracking-wider text-foreground/70">
          代码预览
        </span>
        <Badge variant="outline" class="text-[10px] uppercase">
          {{ languageLabel }}
        </Badge>
      </div>
      <div class="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span>{{ lineCount }} 行</span>
        <Badge variant="outline" class="text-[10px] uppercase">只读</Badge>
      </div>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div v-if="isHighlighting" class="flex min-h-full items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <LoaderCircle class="size-4 animate-spin" />
        正在渲染代码高亮…
      </div>

      <div v-else-if="highlightError" class="px-4 py-4">
        <div class="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {{ highlightError }}
        </div>
        <pre class="mt-4 overflow-x-auto rounded-xl border border-border/40 bg-muted/30 px-4 py-4 font-mono text-xs leading-6 text-foreground/90">{{ props.content || "空文件" }}</pre>
      </div>

      <div v-else-if="hasHighlightedHtml" class="min-w-max">
        <div class="code-preview" v-html="highlightedHtml" />
      </div>

      <pre v-else class="min-h-full overflow-x-auto px-4 py-4 font-mono text-xs leading-6 text-foreground/90">{{ props.content || "空文件" }}</pre>
    </ScrollArea>
  </div>
</template>

<style scoped>
.code-preview :deep(pre.shiki) {
  min-height: 100%;
  margin: 0;
  padding: 12px 0;
  background: transparent !important;
}

.code-preview :deep(code) {
  display: block;
  min-width: max-content;
}

.code-preview :deep(.line) {
  display: inline-block;
  min-width: 100%;
  padding: 0 16px 0 56px;
  position: relative;
  white-space: pre;
}

.code-preview :deep(.line::before) {
  content: counter(line);
  counter-increment: line;
  position: absolute;
  left: 0;
  width: 40px;
  text-align: right;
  color: hsl(var(--muted-foreground));
  opacity: 0.8;
}

.code-preview :deep(pre.shiki code) {
  counter-reset: line;
}
</style>