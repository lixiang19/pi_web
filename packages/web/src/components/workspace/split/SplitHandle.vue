<script setup lang="ts">
import { ref, onUnmounted } from "vue";

defineProps<{
  initialRatio: number;
}>();

const emit = defineEmits<{
  (e: "resize", ratio: number): void;
}>();

const isDragging = ref(false);
const handleEl = ref<HTMLElement | null>(null);

function onMouseDown(e: MouseEvent) {
  e.preventDefault();
  isDragging.value = true;

  function onMouseMove(ev: MouseEvent) {
    const parent = handleEl.value?.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (rect.width === 0) return;

    const pos = ev.clientX - rect.left;
    const newRatio = Math.max(15, Math.min(85, (pos / rect.width) * 100));
    emit("resize", newRatio);
  }

  function onMouseUp() {
    isDragging.value = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

onUnmounted(() => {
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});
</script>

<template>
  <div
    ref="handleEl"
    class="shrink-0 w-1 cursor-col-resize transition-colors hover:bg-primary/20"
    :class="isDragging ? 'bg-primary/30' : 'bg-border/60'"
    @mousedown="onMouseDown"
  />
</template>
