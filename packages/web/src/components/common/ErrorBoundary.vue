<script setup lang="ts">
import { AlertTriangle, RotateCcw } from "lucide-vue-next";
import { onErrorCaptured, ref } from "vue";
import { Button } from "@/components/ui/button";

const props = defineProps<{
	scope: string;
}>();

const errorMessage = ref<string | null>(null);
const retryKey = ref(0);

onErrorCaptured((error) => {
	errorMessage.value = error instanceof Error ? error.message : String(error);
	return false;
});

const retry = () => {
	errorMessage.value = null;
	retryKey.value += 1;
};
</script>

<template>
  <div v-if="errorMessage" class="flex h-full items-center justify-center bg-background px-6">
    <div class="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-sm">
      <div class="flex items-center gap-3">
        <div class="flex size-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <AlertTriangle class="size-4" />
        </div>
        <div>
          <div class="text-sm font-medium text-foreground">{{ props.scope }}暂时不可用</div>
          <div class="mt-1 text-xs text-muted-foreground">已拦截这个区域的异常，其他工作台内容不受影响。</div>
        </div>
      </div>
      <pre class="mt-4 max-h-28 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{{ errorMessage }}</pre>
      <Button class="mt-4" size="sm" variant="outline" @click="retry">
        <RotateCcw class="mr-2 size-3.5" />
        重试
      </Button>
    </div>
  </div>
  <slot v-else :key="retryKey" />
</template>
