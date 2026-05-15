<script setup lang="ts">
import { computed } from "vue";
import { FileCode2, ShieldCheck } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";

const props = defineProps<{
	title: string;
	html: string;
	indexPath?: string;
}>();

const SPACE_PREVIEW_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline'",
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
	const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${SPACE_PREVIEW_CSP}">`;
	const colorSchemeMeta = '<meta name="color-scheme" content="light dark">';
	const injection = `${cspMeta}${colorSchemeMeta}`;
	const source = props.html.trim();

	if (!source) {
		return `<!doctype html><html><head>${injection}</head><body></body></html>`;
	}

	return `<!doctype html><html><head>${injection}</head><body>${props.html}</body></html>`;
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/40 px-4">
      <div class="flex min-w-0 items-center gap-2">
        <FileCode2 class="size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0">
          <div class="truncate text-sm font-medium text-foreground">{{ title }}</div>
          <div v-if="indexPath" class="truncate text-[11px] text-muted-foreground">{{ indexPath }}</div>
        </div>
      </div>
      <Badge variant="outline" class="shrink-0 gap-1 text-[10px]">
        <ShieldCheck class="size-3" />
        Private
      </Badge>
    </header>

    <div class="min-h-0 flex-1 bg-muted/20">
      <iframe
        :key="indexPath || title"
        :srcdoc="sandboxedHtml"
        :title="`${title} 私有预览`"
        sandbox="allow-scripts"
        referrerpolicy="no-referrer"
        class="h-full w-full border-0 bg-white"
      />
    </div>
  </div>
</template>
