<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  checked?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:checked": [value: boolean];
}>();

const toggle = () => {
  if (!props.disabled) {
    emit("update:checked", !props.checked);
  }
};

const trackClass = computed(() =>
  props.checked ? "bg-primary" : "bg-muted-foreground/30",
);
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :disabled="disabled"
    class="group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
    :class="trackClass"
    @click="toggle"
  >
    <span
      class="pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform duration-150"
      :class="checked ? 'translate-x-[18px]' : 'translate-x-[2px]'"
    />
  </button>
</template>
