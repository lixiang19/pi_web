<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FileCode2, FileImage, FileText, FileX2, Folder, FolderOpen, Type } from "lucide-vue-next";
import { Markdown } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";

import { getFileBlobUrl, getFilePreview } from "@/lib/api";
import type { FilePreviewKind, FileTreeEntry } from "@/lib/types";
import ReadonlyCodePreview from "@/components/workbench/file-preview/ReadonlyCodePreview.vue";
import ReadonlyHtmlPreview from "@/components/workbench/file-preview/ReadonlyHtmlPreview.vue";

const props = defineProps<{
  rootDir: string;
  entry: FileTreeEntry | null;
}>();

const content = ref("");
const error = ref("");
const isLoading = ref(false);
const previewKind = ref<FilePreviewKind>("text");
const mimeType = ref("");
const extension = ref("");

const blobUrl = computed(() => {
  if (previewKind.value !== "image" || !props.entry) {
    return "";
  }
  return getFileBlobUrl(props.entry.path, props.rootDir);
});

const formatDate = (value: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

const formatSize = (entry: FileTreeEntry) => {
  if (entry.kind === "directory" || entry.size == null) {
    return "—";
  }

  if (entry.size < 1024) {
    return `${entry.size} B`;
  }

  if (entry.size < 1024 * 1024) {
    return `${(entry.size / 1024).toFixed(1)} KB`;
  }

  return `${(entry.size / 1024 / 1024).toFixed(1)} MB`;
};

const getEntryIcon = (entry: FileTreeEntry) => {
  if (entry.kind === "directory") return Folder;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(entry.extension)) return FileImage;
  if ([".md", ".markdown", ".txt"].includes(entry.extension)) return FileText;
  if (entry.extension) return FileCode2;
  return Type;
};

const loadPreview = async (entry: FileTreeEntry) => {
  if (entry.kind === "directory") return;

  isLoading.value = true;
  error.value = "";
  content.value = "";

  try {
    const result = await getFilePreview(entry.path, props.rootDir);
    content.value = result.content ?? "";
    previewKind.value = result.previewKind;
    mimeType.value = result.mimeType ?? "";
    extension.value = result.extension ?? "";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    previewKind.value = "unsupported";
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => props.entry,
  (entry) => {
    if (entry && entry.kind !== "directory") {
      void loadPreview(entry);
    } else {
      content.value = "";
      error.value = "";
      isLoading.value = false;
      previewKind.value = "text";
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <!-- 空态 -->
    <div
      v-if="!entry"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <FolderOpen class="size-10 text-muted-foreground/25" />
      <p class="text-sm text-muted-foreground">点击文件查看内容</p>
    </div>

    <template v-else>
      <!-- 文件元信息 -->
      <div class="flex items-center gap-3 border-b border-border/40 px-4 py-3">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-md"
          :class="entry.kind === 'directory' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'"
        >
          <component :is="getEntryIcon(entry)" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-foreground">{{ entry.name }}</p>
          <p class="text-[11px] text-muted-foreground">
            {{ formatSize(entry) }}<span class="mx-1">·</span>{{ formatDate(entry.modifiedAt) }}
          </p>
        </div>
      </div>

      <!-- 预览内容 -->
      <div class="min-h-0 flex-1">
        <div
          v-if="isLoading"
          class="flex h-full items-center justify-center text-sm text-muted-foreground"
        >
          正在读取…
        </div>

        <div
          v-else-if="entry.kind === 'directory'"
          class="flex h-full items-center justify-center text-xs text-muted-foreground"
        >
          文件夹不可预览
        </div>

        <div
          v-else-if="error"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <FileX2 class="size-8 text-destructive/40" />
          <p class="text-xs text-destructive/80">{{ error }}</p>
        </div>

        <!-- Markdown -->
        <div
          v-else-if="previewKind === 'markdown'"
          class="h-full overflow-auto px-5 py-4"
        >
          <div
            class="max-w-none text-sm leading-7 text-foreground/88 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:text-primary [&_a]:pointer-events-none [&_blockquote]:border-l-2 [&_blockquote]:border-border/60 [&_blockquote]:pl-4 [&_code]:rounded-md [&_code]:bg-muted/70 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:border-border/50 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:marker:text-muted-foreground [&_ol]:pl-5 [&_p]:text-foreground/88 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/40 [&_pre]:bg-muted/50 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs [&_table]:w-full [&_table]:border-collapse [&_tbody_tr]:border-t [&_tbody_tr]:border-border/40 [&_td]:border [&_td]:border-border/40 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border/40 [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_ul]:pl-5"
          >
            <Markdown :content="content" />
          </div>
        </div>

        <!-- 代码 -->
        <ReadonlyCodePreview
          v-else-if="previewKind === 'code'"
          :content="content"
          :extension="extension"
          :file-name="entry.name"
          :mime-type="mimeType"
        />

        <!-- HTML -->
        <ReadonlyHtmlPreview
          v-else-if="previewKind === 'html'"
          :content="content"
          :file-name="entry.name"
        />

        <!-- 图片 -->
        <div
          v-else-if="previewKind === 'image'"
          class="flex h-full items-center justify-center p-4"
        >
          <img
            :src="blobUrl"
            :alt="entry.name"
            class="max-h-full max-w-full rounded-xl object-contain shadow-sm"
          />
        </div>

        <!-- 纯文本 / 不支持 -->
        <div v-else class="h-full overflow-auto px-4 py-4">
          <pre
            v-if="previewKind === 'text'"
            class="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground/90"
          >{{ content || "空文件" }}</pre>
          <div
            v-else
            class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <FileX2 class="size-8 text-muted-foreground/25" />
            <p class="text-xs text-muted-foreground">
              {{ mimeType || "不支持预览此文件类型" }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
