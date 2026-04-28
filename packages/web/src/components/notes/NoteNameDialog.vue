<script setup lang="ts">
import { computed, ref, watch } from "vue";

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

const model = defineModel<boolean>({ default: false });

const props = defineProps<{
  title: string;
  description: string;
  initialName?: string;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  submit: [name: string];
}>();

const name = ref("");

watch(model, (open) => {
  if (open) {
    name.value = props.initialName ?? "";
  }
});

const canSubmit = computed(() => name.value.trim().length > 0);

function handleSubmit() {
  if (!canSubmit.value) return;
  emit("submit", name.value.trim());
}
</script>

<template>
  <Dialog :open="model" @update:open="model = $event">
    <DialogContent @submit.prevent="handleSubmit">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <Input v-model="name" autofocus @keydown.enter="handleSubmit" />
      <DialogFooter>
        <Button variant="outline" :disabled="isSaving" @click="model = false">取消</Button>
        <Button :disabled="!canSubmit || isSaving" @click="handleSubmit">确认</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
