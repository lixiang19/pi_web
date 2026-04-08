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
import type { SessionSummary } from "@/lib/types";
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
const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});
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
const formatRelativeTime = (timestamp: number) => {
  const delta = timestamp - Date.now();
  const minute = 60 * 100;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (Math.abs(delta) < hour) {
    return relativeTimeFormatter.format(Math.round(delta / minute), "minute");
  }
  if (Math.abs(delta) < day) {
    return relativeTimeFormatter.format(Math.round(delta / hour), "hour");
  }
  return relativeTimeFormatter.format(Math.round(delta / day), "day");
};
</script>
<template>
  <div class="space-y-0">
    <div
      class="group relative flex items-start gap-1.5 px-2 py-1.5 rounded-md transition-colors"
      :class="
        isActive
          ? 'bg-sidebar-accent'
          : 'hover:bg-sidebar-accent/50'
      "
      :style="{ paddingLeft: `${8 + depth * 16}px` }"
    >
      <!-- Active Indicator -->
      <div
        v-if="isActive"
        class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
      />
      <button
        type="button"
        class="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-sidebar-foreground transition-colors rounded"
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
        <div v-if="isEditing" class="flex flex-col gap-1.5">
          <Input
            :model-value="editingTitle"
            class="w-full h-7 text-sm"
            @update:model-value="emit('updateEditingTitle', $event)"
            @keydown.enter.prevent="emit('saveRename', node.session.id)"
            @keydown.esc.prevent="emit('cancelRename')"
            v-focus
          />
        </div>
        <div v-else class="min-w-0">
          <div class="flex items-center gap-1.5">
            <p
              class="truncate text-sm font-medium transition-colors"
              :class="isActive ? 'text-sidebar-foreground' : 'text-sidebar-foreground/90 group-hover:text-sidebar-foreground'"
            >
              {{ node.session.title || '无标题' }}
            </p>
            <Pin v-if="isPinned" class="size-3 shrink-0 text-primary/80" />
            <LoaderCircle v-if="node.session.status === 'streaming'" class="size-3 shrink-0 text-amber-500 animate-spin" />
          </div>
          <div class="mt-0.5 flex items-center gap-2">
            <span v-if="node.session.branch" class="flex items-center gap-1 text-xs text-muted-foreground/70">
              <GitBranchPlus class="size-3" />
              {{ node.session.branch }}
            </span>
            <span class="text-xs text-muted-foreground/60 tabular-nums">{{ formatRelativeTime(node.session.updatedAt) }}</span>
          </div>
        </div>
      </button>
      <!-- Hover Actions -->
      <div v-if="!isEditing" class="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex bg-sidebar-accent/90 rounded px-1">
        <button
          class="p-1 text-muted-foreground/70 hover:text-primary transition-colors rounded"
          @click.stop="emit('togglePin', node.session.id)"
        >
          <Pin class="size-3.5" :class="isPinned ? 'fill-current' : ''" />
        </button>
        <button
          class="p-1 text-muted-foreground/70 hover:text-sidebar-foreground transition-colors rounded"
          @click.stop="emit('startRename', node.session.id, node.session.title)"
        >
          <Pencil class="size-3.5" />
        </button>
        <button
          class="p-1 text-muted-foreground/70 hover:text-destructive transition-colors rounded"
          @click.stop="emit('remove', node.session.id)"
        >
          <Trash2 class="size-3.5" />
        </button>
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
