<script setup lang="ts">
import { ArrowUp, Check } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

defineProps<{
  commitMessage: string;
  selectedCount: number;
  isCommitting: boolean;
}>();

const emit = defineEmits<{
  "update:commitMessage": [value: string];
  commit: [];
  "commit-and-push": [];
}>();
</script>

<template>
  <div class="border-t border-border/50 px-3 py-3">
    <Textarea
      :model-value="commitMessage"
      placeholder="Commit message..."
      class="mb-2 min-h-[64px] resize-none text-[13px]"
      @update:model-value="emit('update:commitMessage', $event as string)"
    />

    <div class="flex items-center gap-2">
      <Button
        size="sm"
        class="flex-1"
        :disabled="!commitMessage.trim() || selectedCount === 0 || isCommitting"
        @click="emit('commit')"
      >
        <Check class="mr-1.5 size-3.5" />
        Commit
        <span
          v-if="selectedCount > 0"
          class="ml-1 text-[10px] opacity-70 tabular-nums"
        >
          ({{ selectedCount }})
        </span>
      </Button>

      <Button
        size="sm"
        variant="outline"
        :disabled="!commitMessage.trim() || selectedCount === 0 || isCommitting"
        @click="emit('commit-and-push')"
      >
        <ArrowUp class="mr-1 size-3.5" />
        Commit & Push
      </Button>
    </div>
  </div>
</template>
