<script setup lang="ts">
import { ref, watch } from "vue";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  description: string;
  initialName?: string;
  isSaving?: boolean;
}>(), {
  initialName: "",
  isSaving: false,
});

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "submit", name: string): void;
}>();

const name = ref("");

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      name.value = props.initialName;
    }
  },
);

const submit = () => {
  const nextName = name.value.trim();
  if (!nextName) {
    return;
  }

  emit("submit", nextName);
};
</script>

<template>
  <Dialog :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <Input v-model="name" autofocus />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="isSaving"
            @click="emit('update:modelValue', false)"
          >
            取消
          </Button>
          <Button type="submit" :disabled="isSaving || !name.trim()">
            确认
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
