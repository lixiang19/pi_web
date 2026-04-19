<script setup lang="ts">
import { Plus, X } from "lucide-vue-next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { TerminalSnapshot } from "@/lib/types";

defineProps<{
  terminals: TerminalSnapshot[];
  activeId: string;
}>();

const emit = defineEmits<{
  activate: [id: string];
  close: [id: string];
  create: [];
  rename: [terminal: TerminalSnapshot];
  restart: [terminal: TerminalSnapshot];
}>();
</script>

<template>
  <div class="flex h-9 min-h-9 items-center border-b border-border/70 bg-background">
    <!-- 新建按钮 -->
    <button
      type="button"
      class="flex h-full shrink-0 items-center px-3 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      title="新建终端"
      @click="emit('create')"
    >
      <Plus class="size-3.5" />
    </button>

    <!-- 分隔线 -->
    <div class="h-4 w-px bg-border/60 shrink-0" />

    <!-- 标签列表 -->
    <div class="flex min-w-0 flex-1 overflow-x-auto">
      <ContextMenu
        v-for="terminal in terminals"
        :key="terminal.id"
      >
        <ContextMenuTrigger as-child>
          <button
            type="button"
            class="group relative flex h-9 min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 border-r border-border/50 px-3 text-left transition-colors"
            :class="
              terminal.id === activeId
                ? 'bg-muted/60 text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            "
            @click="emit('activate', terminal.id)"
          >
            <!-- 状态指示点 -->
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="{
                'bg-emerald-500': terminal.status === 'running',
                'bg-amber-400': terminal.status === 'starting',
                'bg-muted-foreground/50': terminal.status === 'disconnected',
                'bg-destructive': terminal.status === 'error',
                'bg-muted-foreground/30': terminal.status === 'exited',
              }"
            />
            <!-- 标题 -->
            <span class="min-w-0 truncate text-xs font-medium">
              {{ terminal.title }}
            </span>
            <!-- 关闭按钮 -->
            <span
              class="ml-auto shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              :class="terminal.id === activeId ? 'opacity-60 hover:opacity-100' : ''"
              @click.stop="emit('close', terminal.id)"
            >
              <X class="size-3" />
            </span>
          </button>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem @click="emit('rename', terminal)">
            重命名
          </ContextMenuItem>
          <ContextMenuItem @click="emit('restart', terminal)">
            重启
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" @click="emit('close', terminal.id)">
            关闭
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  </div>
</template>
