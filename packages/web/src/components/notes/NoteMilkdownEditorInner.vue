<script setup lang="ts">
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, useEditor } from "@milkdown/vue";

const props = withDefaults(
	defineProps<{
		content: string;
	}>(),
	{
		content: "",
	},
);

const emit = defineEmits<{
	markdownUpdated: [markdown: string];
}>();

useEditor((container) => {
	const crepe = new Crepe({
		root: container,
		defaultValue: props.content,
	});

	crepe.on((listener) => {
		listener.markdownUpdated((_ctx, markdown) => {
			emit("markdownUpdated", markdown);
		});
	});

	return crepe;
});
</script>

<template>
  <div class="milkdown-editor h-full w-full overflow-auto">
    <Milkdown />
  </div>
</template>

<style scoped>
.milkdown-editor {
  background: transparent;
  color: var(--color-foreground);
}

.milkdown-editor :deep(.milkdown) {
  --crepe-color-background: transparent;
  --crepe-color-on-background: var(--foreground);
  --crepe-color-surface: color-mix(in oklab, var(--background) 82%, var(--muted));
  --crepe-color-surface-low: color-mix(in oklab, var(--background) 88%, var(--muted));
  --crepe-color-on-surface: var(--foreground);
  --crepe-color-on-surface-variant: var(--muted-foreground);
  --crepe-color-outline: var(--border);
  --crepe-color-primary: var(--primary);
  --crepe-color-secondary: var(--secondary);
  --crepe-color-on-secondary: var(--secondary-foreground);
  --crepe-color-inverse: var(--foreground);
  --crepe-color-on-inverse: var(--background);
  --crepe-color-inline-code: var(--destructive);
  --crepe-color-error: var(--destructive);
  --crepe-color-hover: color-mix(in oklab, var(--background) 72%, var(--muted));
  --crepe-color-selected: var(--accent);
  --crepe-color-inline-area: var(--muted);
  --crepe-font-title: 'Manrope Variable', sans-serif;
  --crepe-font-default: 'Manrope Variable', sans-serif;
  --crepe-font-code: 'IBM Plex Mono', monospace;
  --crepe-shadow-1: var(--shadow-sm);
  --crepe-shadow-2: var(--shadow-md);
  min-height: 100%;
  background: transparent;
}

.milkdown-editor :deep([data-milkdown-root]) {
  min-height: 100%;
  padding: 3rem 4.5rem 6rem;
  outline: none;
}

.milkdown-editor :deep(.ProseMirror) {
  min-height: calc(100vh - 11rem);
  outline: none;
  color: var(--foreground);
  font-size: 15px;
  line-height: 1.78;
}

.milkdown-editor :deep(.ProseMirror h1) {
  margin-top: 0;
  letter-spacing: 0;
}

.milkdown-editor :deep(.ProseMirror pre) {
  border: 1px solid color-mix(in oklab, var(--border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--background) 76%, var(--muted));
}

.milkdown-editor :deep(.ProseMirror blockquote) {
  border-left-color: var(--primary);
  color: var(--muted-foreground);
}

@media (max-width: 768px) {
  .milkdown-editor :deep([data-milkdown-root]) {
    padding: 2rem 1.5rem 5rem;
  }
}
</style>
