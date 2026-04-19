<script setup lang="ts">
import { computed } from "vue";
import { Globe } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";

const props = defineProps<{
  content: string;
  fileName: string;
}>();

const HTML_SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "navigate-to 'none'",
].join("; ");

const sandboxedHtml = computed(() => {
  const cspMeta = `<meta http-equiv=\"Content-Security-Policy\" content=\"${HTML_SANDBOX_CSP}\">`;
  const colorSchemeMeta = '<meta name="color-scheme" content="light dark">';
  const readOnlyStyle = `<style>
    a,
    area,
    button,
    input,
    select,
    summary,
    textarea,
    [role="button"] {
      pointer-events: none !important;
      cursor: default !important;
    }

    form {
      pointer-events: none !important;
    }
  </style>`;
  const injection = `${cspMeta}${colorSchemeMeta}${readOnlyStyle}`;
  const source = props.content.trim();

  if (!source) {
    return `<!doctype html><html><head>${injection}</head><body></body></html>`;
  }

  if (/<head[\s>]/i.test(props.content)) {
    return props.content.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${injection}`);
  }

  if (/<html[\s>]/i.test(props.content)) {
    return props.content.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${injection}</head>`);
  }

  return `<!doctype html><html><head>${injection}</head><body>${props.content}</body></html>`;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div class="flex h-10 items-center justify-between gap-3 border-b border-border/40 px-3">
      <div class="flex min-w-0 items-center gap-2">
        <Globe class="size-3.5 text-muted-foreground" />
        <span class="truncate text-xs font-semibold uppercase tracking-wider text-foreground/70">
          HTML 预览
        </span>
        <Badge variant="outline" class="text-[10px] uppercase">
          Sandbox
        </Badge>
      </div>
      <div class="text-[11px] text-muted-foreground">
        脚本、外链与宿主 DOM 隔离
      </div>
    </div>

    <div class="min-h-0 flex-1 bg-muted/20 p-3">
      <div class="h-full overflow-hidden rounded-2xl border border-border/40 bg-white shadow-sm">
        <iframe
          :key="fileName"
          :srcdoc="sandboxedHtml"
          title="HTML 文件预览"
          sandbox=""
          referrerpolicy="no-referrer"
          class="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  </div>
</template>
