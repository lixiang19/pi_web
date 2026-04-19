<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useTerminalContextOptions } from "@/composables/useTerminalContextOptions";
import { useTerminalPool } from "@/composables/useTerminalPool";
import TerminalCreateDialog from "@/components/terminal/TerminalCreateDialog.vue";
import TerminalRenameDialog from "@/components/terminal/TerminalRenameDialog.vue";
import TerminalRestartDialog from "@/components/terminal/TerminalRestartDialog.vue";
import TerminalTabBar from "@/components/terminal/TerminalTabBar.vue";
import TerminalViewport from "@/components/terminal/TerminalViewport.vue";
import type { TerminalSnapshot } from "@/lib/types";

const terminalPool = useTerminalPool();
const contextOptions = useTerminalContextOptions();

const isBootstrapping = ref(true);
const createDialogOpen = ref(false);
const renameDialogOpen = ref(false);
const restartDialogOpen = ref(false);
const targetTerminal = ref<TerminalSnapshot | null>(null);

const pageError = computed(
  () => terminalPool.error.value || contextOptions.error.value,
);

const initializePage = async () => {
  isBootstrapping.value = true;

  try {
    await contextOptions.load();
    await terminalPool.load({
      defaultCreatePayload: contextOptions.createDefaultPayload(),
    });
  } finally {
    isBootstrapping.value = false;
  }
};

const handleCreate = (cwd: string) => {
  void terminalPool.createNewTerminal(
    contextOptions.createDefaultPayload(cwd),
  );
};

const handleOpenCreateDialog = () => {
  createDialogOpen.value = true;
};

const handleRenameDialog = (terminal: TerminalSnapshot) => {
  targetTerminal.value = terminal;
  renameDialogOpen.value = true;
};

const handleRestartDialog = (terminal: TerminalSnapshot) => {
  targetTerminal.value = terminal;
  restartDialogOpen.value = true;
};

const handleRename = (id: string, title: string) => {
  void terminalPool.renameTerminalTitle(id, title);
};

const handleRestart = (id: string, cwd: string) => {
  void terminalPool.restartTerminalSession(id, { cwd });
};

const handleClose = (id: string) => {
  void terminalPool.closeTerminal(id);
};

onMounted(() => {
  void initializePage();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <!-- 标签栏 -->
    <TerminalTabBar
      :terminals="terminalPool.terminals.value"
      :active-id="terminalPool.activeTerminalId.value"
      @activate="terminalPool.activateTerminal"
      @close="handleClose"
      @create="handleOpenCreateDialog"
      @rename="handleRenameDialog"
      @restart="handleRestartDialog"
    />

    <!-- 终端主区域：用 grid + h-full 确保高度链（与原始实现一致） -->
    <section class="min-h-0 flex-1">
      <div class="grid h-full min-h-0">
        <!-- 加载中 -->
        <div
          v-if="isBootstrapping"
          class="flex items-center justify-center text-sm text-muted-foreground"
        >
          正在初始化…
        </div>

        <!-- 错误 -->
        <div
          v-else-if="pageError"
          class="flex flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <p class="text-sm text-destructive">{{ pageError }}</p>
        </div>

        <!-- 空态 -->
        <div
          v-else-if="!terminalPool.activeTerminal.value"
          class="flex flex-col items-center justify-center gap-3 text-center"
        >
          <p class="text-sm text-muted-foreground">点击左上角 + 新建终端</p>
        </div>

        <!-- 终端视图：直接放入 grid，h-full 通过 grid 传递 -->
        <TerminalViewport
          v-else
          :terminal="terminalPool.activeTerminal.value"
          :autofocus="true"
        />
      </div>
    </section>

    <!-- Dialogs -->
    <TerminalCreateDialog
      v-model:open="createDialogOpen"
      :options="contextOptions.options.value"
      @create="handleCreate"
    />

    <TerminalRenameDialog
      v-model:open="renameDialogOpen"
      :terminal="targetTerminal"
      @rename="handleRename"
    />

    <TerminalRestartDialog
      v-model:open="restartDialogOpen"
      :terminal="targetTerminal"
      :options="contextOptions.options.value"
      @restart="handleRestart"
    />
  </div>
</template>
