<script setup lang="ts">
import { Bot, Settings2, TerminalSquare } from "lucide-vue-next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

defineEmits<{
  (e: "open-terminal"): void;
  (e: "open-automation"): void;
  (e: "open-settings"): void;
}>();
</script>

<template>
  <div class="flex h-9 items-center gap-0.5 border-b border-border/40 bg-background px-2">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          @click="$emit('open-terminal')"
        >
          <TerminalSquare class="size-4" />
          终端
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">打开终端标签页</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          @click="$emit('open-automation')"
        >
          <Bot class="size-4" />
          自动化
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">打开自动化标签页</TooltipContent>
    </Tooltip>

    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          @click="$emit('open-settings')"
        >
          <Settings2 class="size-4" />
          设置
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">打开设置标签页</TooltipContent>
    </Tooltip>
  </div>
</template>
