<script setup lang="ts">
import { computed } from "vue";
import {
  ChevronDown,
  ChevronRight,
  GitBranchPlus,
  LoaderCircle,
  Pencil,
  Pin,
  Trash2,
} from "lucide-vue-next";
import { Input } from "@/components/ui/input";
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
  pinnedSessionIds: string[];
}>();
const emit = defineEmits<{
  select: [sessionId: string];
  prefetch: [sessionId: string];
  toggleExpand: [sessionId: string];
  startRename: [sessionId: string, currentTitle: string];
  updateEditingTitle: [value: string];
  saveRename: [sessionId: string];
  cancelRename: [];
  togglePin: [sessionId: string];
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
const isPinned = computed(() =>
  props.pinnedSessionIds.includes(props.node.session.id),
);
</script>
<template>
  <div class="space-y-0.5">
    <div
      class="group relative flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors duration-150 select-none"
      :class="
        isActive
          ? 'bg-[#efefee] dark:bg-[#202020]'
          : 'hover:bg-[#efefee]/60 dark:hover:bg-[#202020]/60'
      "
      :style="{ paddingLeft: `${12 + depth * 12}px` }"
    >
      <button
        type="button"
        class="flex size-4 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors rounded"
        :class="hasChildren ? '' : 'pointer-events-none opacity-0'"
        @click.stop="hasChildren && emit('toggleExpand', node.session.id)"
      >
        <component
          :is="isExpanded ? ChevronDown : ChevronRight"
          class="size-3.5"
        />
      </button>

      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        @mouseenter="emit('prefetch', node.session.id)"
        @click="emit('select', node.session.id)"
      >
        <div v-if="isEditing" class="py-0.5">
          <Input
            :model-value="editingTitle"
            class="h-6 w-full text-[13px] bg-background px-1 focus-visible:ring-1 border-none shadow-none"
            @update:model-value="emit('updateEditingTitle', $event)"
            @keydown.enter.prevent="emit('saveRename', node.session.id)"
            @keydown.esc.prevent="emit('cancelRename')"
            v-focus
          />
        </div>
        <div v-else class="min-w-0 pr-6">
          <div class="flex items-center gap-1.5">
            <p
              class="truncate text-[13.5px] font-medium leading-tight"
              :class="isActive ? 'text-foreground' : 'text-foreground/80 group-hover:text-foreground'"
            >
              {{ node.session.title || '无标题' }}
            </p>
            <Pin v-if="isPinned" class="size-3 shrink-0 text-muted-foreground/50" />
            <LoaderCircle v-if="node.session.status === 'streaming'" class="size-3 shrink-0 text-primary animate-spin" />
          </div>
          <div v-if="node.session.branch" class="mt-0.5 flex items-center gap-1 opacity-60">
            <GitBranchPlus class="size-3" />
            <span class="text-[10px] truncate leading-none">{{ node.session.branch }}</span>
          </div>
        </div>
      </button>

      <!-- Hover Actions -->
      <div v-if="!isEditing" class="absolute right-2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div class="flex items-center gap-0.5 h-6 px-1 rounded-md border bg-background shadow-sm">
          <button
            class="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors rounded-sm"
            title="固定"
            @click.stop="emit('togglePin', node.session.id)"
          >
            <Pin class="size-3" :class="isPinned ? 'fill-current' : ''" />
          </button>
          <button
            class="p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors rounded-sm"
            title="重命名"
            @click.stop="emit('startRename', node.session.id, node.session.title)"
          >
            <Pencil class="size-3" />
          </button>
          <button
            class="p-1 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors rounded-sm"
            title="删除"
            @click.stop="emit('remove', node.session.id)"
          >
            <Trash2 class="size-3" />
          </button>
        </div>
      </div>
    </div>
    <!-- Recursive Children -->
    <div v-if="hasChildren && isExpanded" class="animate-in slide-in-from-top-1 duration-150">
      <SessionSidebarSessionNode
        v-for="child in node.children"
        :key="child.session.id"
        :node="child"
        :depth="depth + 1"
        :active-session-id="activeSessionId"
        :editing-session-id="editingSessionId"
        :editing-title="editingTitle"
        :expanded-parent-ids="expandedParentIds"
        :pinned-session-ids="pinnedSessionIds"
        @select="emit('select', $event)"
        @prefetch="emit('prefetch', $event)"
        @toggle-expand="emit('toggleExpand', $event)"
        @start-rename="(sessionId, currentTitle) => emit('startRename', sessionId, currentTitle)"
        @update-editing-title="emit('updateEditingTitle', $event)"
        @save-rename="emit('saveRename', $event)"
        @cancel-rename="emit('cancelRename')"
        @toggle-pin="emit('togglePin', $event)"
        @create-child="(sessionId, cwd) => emit('createChild', sessionId, cwd)"
        @archive="(sessionId, archived) => emit('archive', sessionId, archived)"
        @remove="emit('remove', $event)"
      />
    </div>
  </div>
</template>
<script lang="ts">
const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus()
}
</script>
