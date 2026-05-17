<script setup lang="ts">
import { Bot, Clock, Trash2 } from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AutomationRun, ThinkingLevel } from "@/lib/types";
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
  modelOptions: AutomationOption[];
  nextRunText: string;
  projectOptions: AutomationOption[];
  recentRuns: AutomationRun[];
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

const runStatusDot = (status: AutomationRun["status"]) => {
  if (status === "success") {
    return "bg-green-500";
  }
  if (status === "skipped") {
    return "bg-amber-500";
  }
  return "bg-red-500";
};

const runStatusText = (status: AutomationRun["status"]) => {
  if (status === "success") {
    return "成功";
  }
  if (status === "skipped") {
    return "跳过";
  }
  return "失败";
};

const formatRunTime = (value: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-5">

        <!-- ===== Card 1: 基础配置 ===== -->
        <div class="rounded-xl border border-default bg-card/40 p-5 space-y-5">
          <div class="grid gap-5 sm:grid-cols-[1fr_160px]">
            <div class="space-y-2">
              <Label for="automation-name">规则名称</Label>
              <Input
                id="automation-name"
                :model-value="draft.name"
                placeholder="项目晨报"
                @update:model-value="updateDraft({ name: String($event) })"
              />
            </div>

            <div class="space-y-2">
              <Label>状态</Label>
              <div class="flex h-9 items-center gap-2">
                <Switch
                  :checked="draft.enabled"
                  @update:checked="updateDraft({ enabled: $event })"
                />
                <span class="text-sm text-muted-foreground">
                  {{ draft.enabled ? "已启用" : "已暂停" }}
                </span>
              </div>
            </div>
          </div>

          <div class="grid gap-5 sm:grid-cols-2">
            <div class="space-y-2">
              <Label>运行上下文</Label>
              <Select
                :model-value="draft.scope"
                @update:model-value="updateDraft({ scope: String($event) === 'project' ? 'project' : 'workspace' })"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">工作空间</SelectItem>
                  <SelectItem value="project">项目</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-if="draft.scope === 'project'" class="space-y-2">
              <Label>绑定项目</Label>
              <Select
                :model-value="draft.projectId || NONE_VALUE"
                @update:model-value="updateDraft({ projectId: String($event) === NONE_VALUE ? '' : String($event) })"
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NONE_VALUE">未选择</SelectItem>
                  <SelectItem
                    v-for="project in projectOptions"
                    :key="project.value"
                    :value="project.value"
                  >
                    {{ project.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div v-else class="space-y-2">
              <Label for="automation-cwd">工作目录</Label>
              <Input
                id="automation-cwd"
                :model-value="draft.cwd"
                @update:model-value="updateDraft({ cwd: String($event) })"
              />
            </div>
          </div>
        </div>

        <!-- ===== Card 2: AI 设置 ===== -->
        <div class="rounded-xl border border-default bg-card/40 p-5 space-y-5">
          <div class="grid gap-5 sm:grid-cols-3">
            <div class="space-y-2">
              <Label>Agent</Label>
              <Select
                :model-value="draft.agent || NONE_VALUE"
                @update:model-value="handleAgentChange"
              >
                <SelectTrigger class="gap-2">
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
              <Label>思考深度</Label>
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
          </div>
        </div>

        <!-- ===== Card 3: 调度计划 ===== -->
        <div class="rounded-xl border border-default bg-card/40 p-5 space-y-5">
          <div class="grid gap-5 sm:grid-cols-[200px_1fr]">
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
              <Label for="automation-interval">间隔（分钟）</Label>
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
              <button
                v-for="day in weekdays"
                :key="day.value"
                type="button"
                class="flex size-9 items-center justify-center rounded-full border text-sm transition-all duration-150 hover:bg-soft"
                :class="draft.weekdays.includes(day.value)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-default bg-transparent text-muted-foreground'"
                @click="updateWeekday(day.value)"
              >
                {{ day.label }}
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm">
            <Clock class="size-4 text-primary" />
            <span class="text-primary font-medium">下次运行：{{ nextRunText }}</span>
          </div>
        </div>

        <!-- ===== Card 4: Prompt ===== -->
        <div class="rounded-xl border border-default bg-card/40 p-5 space-y-2">
          <Label for="automation-prompt">发送给 AI 的消息</Label>
          <Textarea
            id="automation-prompt"
            :model-value="draft.prompt"
            class="min-h-44 resize-none focus-visible:ring-primary/30"
            placeholder="请总结这个项目今天需要关注的事情，并给出下一步建议。"
            @update:model-value="updateDraft({ prompt: String($event) })"
          />
        </div>

        <!-- ===== Card 5: 运行记录 ===== -->
        <div class="rounded-xl border border-default bg-card/40 p-5 space-y-3">
          <Label>运行记录</Label>
          <div v-if="recentRuns.length === 0" class="rounded-lg bg-soft px-3 py-3 text-sm text-muted-foreground">
            还没有运行记录
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="run in recentRuns"
              :key="run.id"
              class="flex items-start gap-3 rounded-lg border border-default px-3 py-2.5"
            >
              <div
                class="mt-1.5 size-2 shrink-0 rounded-full"
                :class="runStatusDot(run.status)"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-medium">{{ runStatusText(run.status) }}</span>
                  <span class="shrink-0 text-caption text-muted-foreground">{{ formatRunTime(run.createdAt) }}</span>
                </div>
                <p v-if="run.reason" class="mt-0.5 text-caption text-muted-foreground">
                  {{ run.reason }}
                </p>
                <p v-if="run.sessionId" class="mt-0.5 truncate text-caption text-muted-foreground">
                  会话：{{ run.sessionId }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== Footer: Delete ===== -->
        <div class="flex justify-end pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            @click="emit('delete')"
          >
            <Trash2 class="size-4" />
            删除规则
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
