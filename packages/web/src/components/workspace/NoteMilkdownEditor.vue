<script setup lang="ts">
import { MilkdownProvider } from "@milkdown/vue";
import NoteMilkdownEditorInner from "./NoteMilkdownEditorInner.vue";

defineProps<{
	content: string;
}>();

defineEmits<{
	markdownUpdated: [markdown: string];
}>();
</script>

<template>
  <MilkdownProvider>
    <NoteMilkdownEditorInner
      :content="content"
      @markdown-updated="($event) => $emit('markdownUpdated', $event)"
    />
  </MilkdownProvider>
</template>

