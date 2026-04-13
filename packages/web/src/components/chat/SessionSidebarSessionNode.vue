<script setup lang="ts">
import { computed } from "vue";
import {
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionTreeNode } from "@/lib/session-sidebar";

defineOptions({
  name: "SessionSidebarSessionNode",
});

const props = defineProps<{
  node: SessionTreeNode;
  depth: number;
  activeSessionId: string;
  editingSessionId: string;
  editingTitle: string;
  expandedParentIds: string[];
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  prefetch: [sessionId: string];
  toggleExpand: [sessionId: string];
  startRename: [sessionId: string, currentTitle: string];
  updateEditingTitle: [value: string];
  saveRename: [sessionId: string];
  cancelRename: [];
  createChild: [sessionId: string, cwd: string];
  archive: [sessionId: string, archived: boolean];
  remove: [sessionId: string];
}>();

const hasChildren = computed(() => props.node.children.length > 0);
const isExpanded = computed(() =>
  props.expandedParentIds.includes(props.node.session.id),
);
const isActive = computed(
  () => props.activeSessionId === props.node.session.id,
);
const isEditing = computed(
  () => props.editingSessionId === props.node.session.id,
);

const ButtonComponent = computed(() =>
  props.depth === 0 ? SidebarMenuButton : SidebarMenuSubButton,
);
const ItemComponent = computed(() =>
  props.depth === 0 ? SidebarMenuItem : SidebarMenuSubItem,
);
</script>

<template>
  <component :is="ItemComponent" class="group/session-node relative overflow-hidden">
    <!-- 激活状态左侧高亮条 -->
    <div
      v-if="isActive"
      class="absolute top-1.5 bottom-1.5 left-0 z-10 w-[2.5px] rounded-r-full bg-primary"
    />
    <!-- 悬停时左侧边框效果 -->
    <div
      class="absolute top-1 bottom-1 left-0 z-[5] w-[2px] rounded-r-full bg-sidebar-foreground/20 opacity-0 transition-opacity group-hover/session-node:opacity-100"
      :class="{ '!opacity-0': isActive }"
    />
    <component
      :is="ButtonComponent"
      :is-active="isActive"
      :class="['relative w-full', depth === 1 ? 'ml-4' : '']"
      @mouseenter="emit('prefetch', node.session.id)"
      @click="emit('select', node.session.id)"
    >
      <button
        v-if="hasChildren"
        type="button"
        class="mr-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
        @click.stop="emit('toggleExpand', node.session.id)"
      >
        <component
          :is="isExpanded ? ChevronDown : ChevronRight"
          class="size-3.5"
        />
      </button>

      <div v-if="isEditing" class="flex-1 py-0.5">
        <Input
          :model-value="editingTitle"
          class="h-6 w-full border-none bg-background px-1 text-[13px] shadow-none focus-visible:ring-1"
          @update:model-value="emit('updateEditingTitle', $event)"
          @keydown.enter.prevent="emit('saveRename', node.session.id)"
          @keydown.esc.prevent="emit('cancelRename')"
          v-focus
          @click.stop
        />
      </div>

      <div v-else class="flex min-w-0 flex-1 items-center gap-1.5">
        <p
          class="truncate text-[13px] leading-tight font-medium"
          :class="
            isActive
              ? 'text-foreground'
              : 'text-foreground/80 group-hover/session-node:text-foreground'
          "
        >
          {{ node.session.title || '无标题' }}
        </p>
        <LoaderCircle
          v-if="node.session.status === 'streaming'"
          class="size-3 shrink-0 animate-spin text-primary"
        />
      </div>
    </component>

    <template v-if="!isEditing">
      <div
        class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/session-node:opacity-100"
      >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-foreground"
              title="更多操作"
              @click.stop
            >
              <MoreHorizontal class="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-32">
            <DropdownMenuItem
              @click="emit('startRename', node.session.id, node.session.title)"
            >
              <Pencil class="mr-2 size-3.5" />
              <span>重命名</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              class="text-destructive focus:text-destructive"
              @click="emit('remove', node.session.id)"
            >
              <Trash2 class="mr-2 size-3.5" />
              <span>删除</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </template>

    <SidebarMenuSub v-if="hasChildren && isExpanded" class="mx-0 ml-3 border-l border-sidebar-border px-2 py-0.5">
      <SessionSidebarSessionNode
        v-for="child in node.children"
        :key="child.session.id"
        :node="child"
        :depth="depth + 1"
        :active-session-id="activeSessionId"
        :editing-session-id="editingSessionId"
        :editing-title="editingTitle"
        :expanded-parent-ids="expandedParentIds"
        @select="emit('select', $event)"
        @prefetch="emit('prefetch', $event)"
        @toggle-expand="emit('toggleExpand', $event)"
        @start-rename="(sessionId, currentTitle) => emit('startRename', sessionId, currentTitle)"
        @update-editing-title="emit('updateEditingTitle', $event)"
        @save-rename="emit('saveRename', $event)"
        @cancel-rename="emit('cancelRename')"
        @create-child="(sessionId, cwd) => emit('createChild', sessionId, cwd)"
        @archive="(sessionId, archived) => emit('archive', sessionId, archived)"
        @remove="emit('remove', $event)"
      />
    </SidebarMenuSub>
  </component>
</template>

<script lang="ts">
const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus(),
};
</script>
