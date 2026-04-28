<script setup lang="ts">
import {
	ArrowDown,
	ArrowUp,
	GitBranch,
	LoaderCircle,
	RefreshCw,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

defineProps<{
	currentBranch: string | null;
	ahead: number;
	behind: number;
	isLoading: boolean;
	isSyncing: boolean;
	canPushPull: boolean;
}>();

const emit = defineEmits<{
	refresh: [];
	fetch: [];
	pull: [];
	push: [];
}>();
</script>

<template>
  <div class="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
    <!-- 分支信息 -->
    <div class="flex min-w-0 items-center gap-2">
      <GitBranch class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="truncate text-sm font-medium text-foreground">
        {{ currentBranch || "detached" }}
      </span>

      <!-- ahead / behind badges -->
      <span
        v-if="ahead > 0"
        class="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums"
      >
        <ArrowUp class="size-2.5" />{{ ahead }}
      </span>
      <span
        v-if="behind > 0"
        class="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums"
      >
        <ArrowDown class="size-2.5" />{{ behind }}
      </span>
    </div>

    <!-- 操作按钮 -->
    <TooltipProvider>
      <div class="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground hover:text-foreground"
              :disabled="isSyncing"
              @click="emit('refresh')"
            >
              <LoaderCircle v-if="isLoading" class="size-3.5 animate-spin" />
              <RefreshCw v-else class="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>刷新状态</p></TooltipContent>
        </Tooltip>

        <template v-if="canPushPull">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-foreground"
                :disabled="isSyncing"
                @click="emit('pull')"
              >
                <LoaderCircle v-if="isSyncing" class="size-3.5 animate-spin" />
                <ArrowDown v-else class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Pull</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="text-muted-foreground hover:text-foreground"
                :disabled="isSyncing || ahead === 0"
                @click="emit('push')"
              >
                <ArrowUp class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Push</p></TooltipContent>
          </Tooltip>
        </template>
      </div>
    </TooltipProvider>
  </div>
</template>
