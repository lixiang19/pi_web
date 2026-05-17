<script setup lang="ts">
import { Bot, Clock, Plus } from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AutomationRule } from "@/lib/types";

defineProps<{
  rules: AutomationRule[];
  isLoading: boolean;
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

const formatSchedule = (rule: AutomationRule) => {
  const parts: string[] = [];

  if (rule.schedule.type === "daily") {
    parts.push("每天");
  } else if (rule.schedule.type === "weekly") {
    const dayMap = ["日", "一", "二", "三", "四", "五", "六"];
    const labels = rule.schedule.weekdays.map((d: number) => `周${dayMap[d]}`);
    parts.push(`每周 ${labels.join(", ")}`);
  } else {
    parts.push(`每 ${rule.schedule.everyMinutes} 分钟`);
  }

  if (rule.schedule.type !== "interval") {
    parts.push(rule.schedule.time);
  }

  return parts.join(" · ");
};

const formatScope = (rule: AutomationRule) =>
  rule.scope === "project"
    ? rule.projectName || "项目"
    : "工作空间";
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Header -->
    <header class="ridge-panel-header flex min-h-14 shrink-0 items-center justify-between px-5">
      <div class="flex items-center gap-2">
        <Bot class="size-4 text-primary" />
        <h1 class="text-sm font-semibold tracking-tight">定时会话</h1>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        class="gap-1.5"
        @click="emit('create')"
      >
        <Plus class="size-4" />
        新建
      </Button>
    </header>

    <!-- Content -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <!-- Loading -->
      <div v-if="isLoading && rules.length === 0" class="flex flex-col items-center gap-3 py-20">
        <div class="size-8 animate-pulse rounded-full bg-muted" />
        <p class="text-caption text-muted-foreground">加载中…</p>
      </div>

      <!-- Empty -->
      <div v-else-if="rules.length === 0" class="flex flex-col items-center py-20">
        <div class="flex items-center justify-center size-12 rounded-full bg-muted mb-4">
          <Bot class="size-6 text-muted-foreground/50" />
        </div>
        <p class="text-sm font-medium text-foreground">还没有定时会话</p>
        <p class="text-caption text-muted-foreground mt-1">创建规则来自动运行 AI 任务</p>
        <Button
          type="button"
          size="sm"
          class="mt-4 gap-1.5"
          @click="emit('create')"
        >
          <Plus class="size-4" />
          创建规则
        </Button>
      </div>

      <!-- List -->
      <div v-else class="space-y-1 pt-1">
        <button
          v-for="rule in rules"
          :key="rule.id"
          type="button"
          class="group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-soft"
          @click="emit('select', rule.id)"
        >
          <!-- Status bar -->
          <div
            class="mt-1.5 size-[3px] shrink-0 rounded-full"
            :class="rule.enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
          />

          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <p class="truncate text-sm font-semibold text-foreground">
                {{ rule.name }}
              </p>
              <Switch
                :checked="rule.enabled"
                class="shrink-0"
                @click.stop="emit('toggle', rule.id, !rule.enabled)"
              />
            </div>
            <div class="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
              <Clock class="size-3 shrink-0" />
              <span class="truncate">{{ formatNextRun(rule.nextRunAt) }}</span>
              <span class="shrink-0 text-muted-foreground/40">·</span>
              <span class="truncate">{{ formatSchedule(rule) }}</span>
              <span class="shrink-0 text-muted-foreground/40">·</span>
              <span class="truncate">{{ formatScope(rule) }}</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
