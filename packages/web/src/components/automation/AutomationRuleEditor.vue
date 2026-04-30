<script setup lang="ts">
import { Bot, CalendarClock, Play, Save, Trash2 } from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ThinkingLevel } from "@/lib/types";
import type {
  AutomationOption,
  AutomationRuleDraft,
  AutomationScheduleType,
} from "./types";

const NONE_VALUE = "__none__";

const props = defineProps<{
  draft: AutomationRuleDraft;
  agentOptions: AutomationOption[];
  isSaving: boolean;
  isRunnable: boolean;
  modelOptions: AutomationOption[];
  nextRunText: string;
  thinkingOptions: AutomationOption[];
}>();

const emit = defineEmits<{
  delete: [];
  run: [];
  save: [];
  updateDraft: [draft: AutomationRuleDraft];
}>();

const weekdays = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

const updateDraft = (patch: Partial<AutomationRuleDraft>) => {
  emit("updateDraft", { ...props.draft, ...patch });
};

const updateWeekday = (weekday: number) => {
  const current = new Set(props.draft.weekdays);
  if (current.has(weekday)) {
    current.delete(weekday);
  } else {
    current.add(weekday);
  }

  updateDraft({ weekdays: [...current].sort((left, right) => left - right) });
};

const handleAgentChange = (value: unknown) => {
  updateDraft({ agent: String(value) === NONE_VALUE ? "" : String(value) });
};

const handleModelChange = (value: unknown) => {
  updateDraft({ model: String(value) === NONE_VALUE ? "" : String(value) });
};
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <header class="ridge-panel-header flex min-h-16 shrink-0 items-center justify-between gap-4 px-6">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <CalendarClock class="size-4 text-primary" />
          <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
            Scheduled Chat
          </p>
        </div>
        <h1 class="mt-1 truncate text-lg font-semibold tracking-tight">
          定时会话
        </h1>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          :disabled="!isRunnable || isSaving"
          @click="emit('run')"
        >
          <Play class="size-4" />
          立即创建
        </Button>
        <Button
          type="button"
          :disabled="isSaving"
          @click="emit('save')"
        >
          <Save class="size-4" />
          保存
        </Button>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-4xl flex-col gap-7 px-6 py-6">
        <section class="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <div class="space-y-2">
            <Label for="automation-name">名称</Label>
            <Input
              id="automation-name"
              :model-value="draft.name"
              placeholder="项目晨报"
              @update:model-value="updateDraft({ name: String($event) })"
            />
          </div>

          <div class="space-y-2">
            <Label>状态</Label>
            <Button
              type="button"
              variant="outline"
              class="w-full justify-start"
              @click="updateDraft({ enabled: !draft.enabled })"
            >
              {{ draft.enabled ? "启用" : "暂停" }}
            </Button>
          </div>
        </section>

        <section class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <Label>Agent</Label>
            <Select
              :model-value="draft.agent || NONE_VALUE"
              @update:model-value="handleAgentChange"
            >
              <SelectTrigger>
                <Bot class="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE_VALUE">直接模式</SelectItem>
                <SelectItem
                  v-for="agent in agentOptions"
                  :key="agent.value"
                  :value="agent.value"
                >
                  {{ agent.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>模型</Label>
            <Select
              :model-value="draft.model || NONE_VALUE"
              @update:model-value="handleModelChange"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="NONE_VALUE">系统默认</SelectItem>
                <SelectItem
                  v-for="model in modelOptions"
                  :key="model.value"
                  :value="model.value"
                >
                  {{ model.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>思考</Label>
            <Select
              :model-value="draft.thinkingLevel"
              @update:model-value="updateDraft({ thinkingLevel: $event as ThinkingLevel })"
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="thinking in thinkingOptions"
                  :key="thinking.value"
                  :value="thinking.value"
                >
                  {{ thinking.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section class="space-y-4">
          <div class="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <div class="space-y-2">
              <Label>频率</Label>
              <Select
                :model-value="draft.scheduleType"
                @update:model-value="updateDraft({ scheduleType: $event as AutomationScheduleType })"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">每天</SelectItem>
                  <SelectItem value="weekly">每周</SelectItem>
                  <SelectItem value="interval">间隔</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="draft.scheduleType !== 'interval'" class="space-y-2">
              <Label for="automation-time">时间</Label>
              <Input
                id="automation-time"
                type="time"
                :model-value="draft.time"
                @update:model-value="updateDraft({ time: String($event) })"
              />
            </div>

            <div v-else class="space-y-2">
              <Label for="automation-interval">间隔分钟</Label>
              <Input
                id="automation-interval"
                type="number"
                min="1"
                :model-value="draft.everyMinutes"
                @update:model-value="updateDraft({ everyMinutes: Number($event) })"
              />
            </div>
          </div>

          <div v-if="draft.scheduleType === 'weekly'" class="space-y-2">
            <Label>星期</Label>
            <div class="flex flex-wrap gap-2">
              <Button
                v-for="day in weekdays"
                :key="day.value"
                type="button"
                size="sm"
                :variant="draft.weekdays.includes(day.value) ? 'default' : 'outline'"
                class="h-8 w-9 px-0"
                @click="updateWeekday(day.value)"
              >
                {{ day.label }}
              </Button>
            </div>
          </div>

          <div class="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            下一次会话：{{ nextRunText }}
          </div>
        </section>

        <section class="space-y-2">
          <Label for="automation-prompt">发送给 AI 的消息</Label>
          <Textarea
            id="automation-prompt"
            :model-value="draft.prompt"
            class="min-h-52 resize-none"
            placeholder="请总结这个项目今天需要关注的事情，并给出下一步建议。"
            @update:model-value="updateDraft({ prompt: String($event) })"
          />
        </section>

        <section class="flex justify-end border-t border-border/50 pt-4">
          <Button
            type="button"
            variant="destructive"
            :disabled="!draft.id || isSaving"
            @click="emit('delete')"
          >
            <Trash2 class="size-4" />
            删除
          </Button>
        </section>
      </div>
    </div>
  </section>
</template>
