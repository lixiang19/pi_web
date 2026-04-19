<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "submit"): void;
  (e: "cancel"): void;
}>();

const updateValue = (value: string | number) => {
  emit("update:modelValue", String(value));
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="space-y-1">
      <p class="text-sm font-medium text-foreground/90">发给 AI</p>
      <p class="text-xs leading-5 text-muted-foreground">
        会把当前区块和你的补充说明一起写入当前会话输入框，可留空直接带上区块内容。
      </p>
    </div>

    <Textarea
      :model-value="props.modelValue"
      placeholder="补充你想让 AI 处理的问题，可留空"
      class="min-h-24 resize-none text-sm"
      @update:model-value="updateValue"
      @keydown.enter.meta.prevent="emit('submit')"
      @keydown.enter.ctrl.prevent="emit('submit')"
    />

    <div class="flex items-center justify-end gap-2">
      <Button size="sm" variant="ghost" @click="emit('cancel')">取消</Button>
      <Button size="sm" @click="emit('submit')">加入输入框</Button>
    </div>
  </div>
</template>
