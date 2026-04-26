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
  background: var(--color-card);
  color: var(--color-foreground);
}

.milkdown-editor :deep(.milkdown) {
  --crepe-color-background: var(--card);
  --crepe-color-on-background: var(--card-foreground);
  --crepe-color-surface: var(--secondary);
  --crepe-color-surface-low: var(--muted);
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
  --crepe-color-hover: var(--muted);
  --crepe-color-selected: var(--accent);
  --crepe-color-inline-area: var(--muted);
  --crepe-font-title: var(--font-serif);
  --crepe-font-default: var(--font-sans);
  --crepe-font-code: var(--font-mono);
  --crepe-shadow-1: var(--shadow-sm);
  --crepe-shadow-2: var(--shadow-md);
}

.milkdown-editor :deep([data-milkdown-root]) {
  min-height: 100%;
  padding: 1rem 1.5rem;
  outline: none;
}
</style>
