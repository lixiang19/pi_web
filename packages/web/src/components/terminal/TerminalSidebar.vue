<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FolderTree, RefreshCcw, TerminalSquare, X } from "lucide-vue-next";

import type { TerminalSnapshot } from "@/lib/types";
import type { TerminalCwdOption } from "@/composables/useTerminalContextOptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const props = defineProps<{
  terminal: TerminalSnapshot | null;
  options: TerminalCwdOption[];
  optionsLoading?: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [terminalId: string];
  create: [cwd: string];
  rename: [terminalId: string, title: string];
  restart: [terminalId: string, cwd: string];
}>();

const titleDraft = ref("");
const cwdDraft = ref("");

watch(
  () => props.terminal?.id,
  () => {
    titleDraft.value = props.terminal?.title || "";
    cwdDraft.value = props.terminal?.cwd || props.options[0]?.value || "";
  },
  { immediate: true },
);

watch(
  () => props.options,
  (nextOptions) => {
    if (!cwdDraft.value && nextOptions[0]) {
      cwdDraft.value = nextOptions[0].value;
    }
  },
  { immediate: true },
);

const statusLabel = computed(() => {
  if (!props.terminal) {
    return "未激活";
  }

  switch (props.terminal.status) {
    case "running":
      return "运行中";
    case "starting":
      return "启动中";
    case "disconnected":
      return "未附着";
    case "exited":
      return "已退出";
    case "error":
      return "错误";
    default:
      return "未知";
  }
});

const canRename = computed(
  () =>
    Boolean(props.terminal) &&
    titleDraft.value.trim().length > 0 &&
    titleDraft.value.trim() !== props.terminal?.title,
);

const canRestart = computed(() => Boolean(props.terminal && cwdDraft.value));

const submitRename = () => {
    if (!props.terminal || !canRename.value) {
      return;
    }

    emit("rename", props.terminal.id, titleDraft.value.trim());
  };

const submitRestart = () => {
  if (!props.terminal || !cwdDraft.value) {
    return;
  }

  emit("restart", props.terminal.id, cwdDraft.value);
};

const createHere = () => {
  if (!cwdDraft.value) {
    return;
  }

  emit("create", cwdDraft.value);
};
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto p-4">
    <Card class="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle class="flex items-center justify-between gap-3 text-base">
          <span class="flex items-center gap-2">
            <TerminalSquare class="size-4 text-primary/70" />
            终端信息
          </span>

          <Badge variant="outline">{{ statusLabel }}</Badge>
        </CardTitle>
        <CardDescription>
          当前激活终端的运行状态、标题和目录上下文。
        </CardDescription>
      </CardHeader>

      <CardContent v-if="terminal" class="space-y-4">
        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">终端标题</p>
          <div class="flex gap-2">
            <Input v-model="titleDraft" class="flex-1" placeholder="输入终端标题" />
            <Button :disabled="!canRename || busy" @click="submitRename">
              保存
            </Button>
          </div>
        </div>

        <div class="grid gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 text-sm">
          <div class="flex items-start justify-between gap-3">
            <span class="text-muted-foreground">当前目录</span>
            <span class="min-w-0 text-right text-foreground">{{ terminal.cwd }}</span>
          </div>
          <div class="flex items-start justify-between gap-3">
            <span class="text-muted-foreground">Shell</span>
            <span class="text-right text-foreground">{{ terminal.shell }}</span>
          </div>
          <div class="flex items-start justify-between gap-3">
            <span class="text-muted-foreground">尺寸</span>
            <span class="text-right text-foreground">{{ terminal.cols }} x {{ terminal.rows }}</span>
          </div>
          <div class="flex items-start justify-between gap-3">
            <span class="text-muted-foreground">退出码</span>
            <span class="text-right text-foreground">{{ terminal.exitCode ?? "-" }}</span>
          </div>
        </div>

        <Button variant="outline" class="w-full justify-start gap-2" :disabled="busy" @click="emit('close', terminal.id)">
          <X class="size-4" />
          关闭当前终端
        </Button>
      </CardContent>

      <CardContent v-else class="text-sm text-muted-foreground">
        当前没有激活终端。先新建一个终端标签，再在这里管理标题和工作目录。
      </CardContent>
    </Card>

    <Card class="border-border/70 bg-card/60">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <FolderTree class="size-4 text-primary/70" />
          工作目录
        </CardTitle>
        <CardDescription>
          目录切换采用“重启到新 cwd”，不向当前 shell 注入 `cd`。
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-4">
        <div class="space-y-2">
          <p class="text-xs font-medium text-muted-foreground">选择上下文目录</p>
          <Select v-model="cwdDraft">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="选择一个工作目录" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in options"
                :key="option.value"
                :value="option.value"
              >
                {{ option.group }} · {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="text-xs text-muted-foreground">
            {{ optionsLoading ? "正在加载项目和 worktree 目录..." : cwdDraft || "当前没有可选目录" }}
          </p>
        </div>

        <div class="grid gap-2">
          <Button class="w-full justify-start gap-2" :disabled="!canRestart || busy" @click="submitRestart">
            <RefreshCcw class="size-4" />
            以该目录重启当前终端
          </Button>
          <Button variant="outline" class="w-full justify-start gap-2" :disabled="!cwdDraft || busy" @click="createHere">
            <TerminalSquare class="size-4" />
            在该目录新建终端
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>