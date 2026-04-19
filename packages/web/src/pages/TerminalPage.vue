<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  PanelRightOpen,
  Plus,
  X,
} from "lucide-vue-next";

import { useTerminalContextOptions } from "@/composables/useTerminalContextOptions";
import { useTerminalPool } from "@/composables/useTerminalPool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import TerminalSidebar from "@/components/terminal/TerminalSidebar.vue";
import TerminalViewport from "@/components/terminal/TerminalViewport.vue";

const terminalPool = useTerminalPool();
const contextOptions = useTerminalContextOptions();

const isBootstrapping = ref(true);
const mobileSidebarOpen = ref(false);

const pageError = computed(
  () => terminalPool.error.value || contextOptions.error.value,
);

const activeTerminalStatus = computed(() => {
  if (!terminalPool.activeTerminal.value) {
    return "未激活";
  }

  switch (terminalPool.activeTerminal.value.status) {
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

const statusPoints = computed(() => [
  `全局终端数：${terminalPool.terminals.value.length}`,
  `当前主终端：${terminalPool.activeTerminal.value?.title || "未激活"}`,
  `当前状态：${activeTerminalStatus.value}`,
  terminalPool.splitTerminal.value
    ? `分屏终端：${terminalPool.splitTerminal.value.title}`
    : "当前为单窗格模式",
]);

const initializePage = async () => {
  isBootstrapping.value = true;

  try {
    try {
      await contextOptions.load();
    } finally {
      await terminalPool.load({
        defaultCreatePayload: contextOptions.createDefaultPayload(),
      });
    }
  } finally {
    isBootstrapping.value = false;
  }
};

const createTerminalInContext = async (cwd?: string, focus?: "active" | "split") => {
  await terminalPool.createNewTerminal(
    contextOptions.createDefaultPayload(cwd),
    focus ? { focus } : undefined,
  );
};

const handleCreateTerminal = async () => {
  await createTerminalInContext();
};

const handleOpenSplit = async () => {
  await terminalPool.openSplit();
};

const handleRenameTerminal = async (terminalId: string, title: string) => {
  await terminalPool.renameTerminalTitle(terminalId, title);
};

const handleRestartTerminal = async (terminalId: string, cwd: string) => {
  await terminalPool.restartTerminalSession(terminalId, { cwd });
};

const handleCloseTerminal = async (terminalId: string) => {
  await terminalPool.closeTerminal(terminalId);
};

onMounted(() => {
  void initializePage();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="border-b border-border/70 bg-background/90 px-4 py-4 backdrop-blur">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
              Terminal
            </p>
            <Badge variant="outline">{{ activeTerminalStatus }}</Badge>
          </div>

          <div>
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">终端</h1>
            <p class="mt-1 text-sm text-muted-foreground">
              基于 wterm 的真实终端页面，运行时由 Node 服务层 PTY + WebSocket 提供。
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Button :disabled="terminalPool.isMutating.value" @click="handleCreateTerminal">
            <Plus class="size-4" />
            新建终端
          </Button>
          <Button
            variant="outline"
            :disabled="!terminalPool.activeTerminal.value || terminalPool.isMutating.value"
            @click="handleOpenSplit"
          >
            分屏
          </Button>
          <Button variant="outline" class="xl:hidden" @click="mobileSidebarOpen = true">
            <PanelRightOpen class="size-4" />
            侧栏
          </Button>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <Badge
          v-for="point in statusPoints"
          :key="point"
          variant="secondary"
          class="rounded-full px-3 py-1 text-[11px]"
        >
          {{ point }}
        </Badge>
      </div>
    </header>

    <div class="border-b border-border/70 px-4 py-3">
      <div class="flex gap-3 overflow-x-auto pb-1">
        <button
          v-for="terminal in terminalPool.terminals.value"
          :key="terminal.id"
          type="button"
          class="group flex min-w-[220px] shrink-0 items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors"
          :class="
            terminal.id === terminalPool.activeTerminalId.value
              ? 'border-primary/60 bg-primary/8 text-foreground'
              : 'border-border/70 bg-card/60 text-foreground/80 hover:bg-accent/40'
          "
          @click="terminalPool.activateTerminal(terminal.id)"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">
              {{ terminal.title }}
            </p>
            <p class="truncate text-xs text-muted-foreground">
              {{ terminal.cwd }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <Badge
              v-if="terminal.id === terminalPool.splitTerminalId.value"
              variant="outline"
              class="text-[10px]"
            >
              分屏
            </Badge>
            <button
              type="button"
              class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
              @click.stop="handleCloseTerminal(terminal.id)"
            >
              <X class="size-4" />
            </button>
          </div>
        </button>
      </div>
    </div>

    <div v-if="pageError" class="px-4 pt-4">
      <div class="rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
        {{ pageError }}
      </div>
    </div>

    <main class="flex min-h-0 flex-1 overflow-hidden">
      <section class="min-h-0 flex-1 p-4">
        <div v-if="isBootstrapping" class="flex h-full items-center justify-center rounded-[28px] border border-border/70 bg-card/40 text-sm text-muted-foreground">
          正在初始化终端页面...
        </div>

        <div
          v-else-if="terminalPool.visibleTerminals.value.length === 0"
          class="flex h-full items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-card/40 px-6 text-center text-sm text-muted-foreground"
        >
          当前没有终端。点击上方“新建终端”开始运行命令。
        </div>

        <div
          v-else
          class="grid h-full min-h-0 gap-4"
          :class="terminalPool.splitTerminal.value ? 'xl:grid-cols-2' : 'grid-cols-1'"
        >
          <TerminalViewport
            v-for="(terminal, index) in terminalPool.visibleTerminals.value"
            :key="terminal.id"
            :terminal="terminal"
            :autofocus="index === 0"
          />
        </div>
      </section>

      <aside class="hidden w-[340px] shrink-0 border-l border-border/70 bg-background/70 xl:block">
        <TerminalSidebar
          :terminal="terminalPool.activeTerminal.value"
          :options="contextOptions.options.value"
          :options-loading="contextOptions.isLoading.value"
          :busy="terminalPool.isMutating.value"
          @close="handleCloseTerminal"
          @create="createTerminalInContext"
          @rename="handleRenameTerminal"
          @restart="handleRestartTerminal"
        />
      </aside>
    </main>

    <Sheet v-model:open="mobileSidebarOpen">
      <SheetContent side="right" class="w-[92vw] max-w-[360px] p-0">
        <SheetHeader class="border-b border-border/70 px-4 py-4 text-left">
          <SheetTitle>终端侧栏</SheetTitle>
          <SheetDescription>
            管理当前终端标题与工作目录。
          </SheetDescription>
        </SheetHeader>

        <TerminalSidebar
          :terminal="terminalPool.activeTerminal.value"
          :options="contextOptions.options.value"
          :options-loading="contextOptions.isLoading.value"
          :busy="terminalPool.isMutating.value"
          @close="handleCloseTerminal"
          @create="createTerminalInContext"
          @rename="handleRenameTerminal"
          @restart="handleRestartTerminal"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>
