<script setup lang="ts">
import { Clock, Plus } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AutomationRule } from "@/lib/types";

defineProps<{
  rules: AutomationRule[];
  selectedId: string;
}>();

const emit = defineEmits<{
  create: [];
  select: [id: string];
  toggle: [id: string, enabled: boolean];
}>();

const formatNextRun = (value?: number) => {
  if (!value) {
    return "已暂停";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
};
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-border/50 bg-muted/10">
    <div class="flex h-14 shrink-0 items-center justify-between px-4">
      <div>
        <h2 class="text-sm font-semibold tracking-tight">规则</h2>
        <p class="text-[11px] text-muted-foreground">到时间后创建普通会话</p>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="新建规则"
        @click="emit('create')"
      >
        <Plus class="size-4" />
      </Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <div v-if="rules.length === 0" class="px-2 py-10 text-center">
        <p class="text-sm font-medium text-muted-foreground">还没有定时会话</p>
      </div>

      <div v-else class="space-y-2">
        <button
          v-for="rule in rules"
          :key="rule.id"
          type="button"
          class="w-full rounded-lg border px-3 py-3 text-left transition-colors"
          :class="rule.id === selectedId
            ? 'border-primary/40 bg-primary/10'
            : 'border-border/50 bg-card/60 hover:bg-accent/40'"
          @click="emit('select', rule.id)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-foreground">
                {{ rule.name }}
              </p>
              <div class="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock class="size-3 shrink-0" />
                <span class="truncate">{{ formatNextRun(rule.nextRunAt) }}</span>
              </div>
            </div>
            <Badge
              :variant="rule.enabled ? 'default' : 'secondary'"
              class="shrink-0"
            >
              {{ rule.enabled ? "启用" : "暂停" }}
            </Badge>
          </div>

          <div class="mt-3 flex items-center justify-between gap-2">
            <p class="truncate text-[11px] text-muted-foreground/80">
              {{ rule.cwd }}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-7 shrink-0 px-2 text-xs"
              @click.stop="emit('toggle', rule.id, !rule.enabled)"
            >
              {{ rule.enabled ? "暂停" : "启用" }}
            </Button>
          </div>
        </button>
      </div>
    </div>
  </aside>
</template>
