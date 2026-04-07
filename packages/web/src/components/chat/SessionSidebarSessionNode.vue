<script setup lang="ts">
import { computed } from "vue";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  GitBranchPlus,
  LoaderCircle,
  Pencil,
  Pin,
  Save,
  Trash2,
  X,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
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

const statusTone = (status: SessionSummary["status"]) => {
  if (status === "streaming") {
    return "bg-amber-300";
  }

  if (status === "error") {
    return "bg-red-300";
  }

  return "bg-emerald-300";
};

const formatRelativeTime = (timestamp: number) => {
  const delta = timestamp - Date.now();
  const minute = 60 * 1000;
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
  <div class="space-y-1">
    <div
      class="group rounded-2xl border px-2 py-2 transition"
      :class="
        isActive
          ? 'border-amber-400/30 bg-amber-500/10'
          : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]'
      "
      :style="{ marginLeft: `${depth * 14}px` }"
    >
      <div class="flex items-start gap-2">
        <button
          type="button"
          class="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full text-stone-500 transition hover:bg-white/10 hover:text-stone-200"
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
          @focus="emit('prefetch', node.session.id)"
          @click="emit('select', node.session.id)"
        >
          <div v-if="isEditing" class="space-y-2 pr-1">
            <Input
              :model-value="editingTitle"
              class="h-8 border-white/10 bg-white/[0.04] text-sm text-stone-100"
              @update:model-value="
                (value) => emit('updateEditingTitle', String(value))
              "
              @keydown.enter.prevent="emit('saveRename', node.session.id)"
              @keydown.esc.prevent="emit('cancelRename')"
            />
            <div class="flex items-center gap-2">
              <Button
                size="sm"
                class="h-7 rounded-full px-3 text-xs"
                @click.stop="emit('saveRename', node.session.id)"
              >
                <Save class="size-3.5" />
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-7 rounded-full px-3 text-xs text-stone-400"
                @click.stop="emit('cancelRename')"
              >
                <X class="size-3.5" />
                取消
              </Button>
            </div>
          </div>

          <div v-else class="min-w-0">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="mt-0.5 size-2 shrink-0 rounded-full"
                    :class="statusTone(node.session.status)"
                  />
                  <p class="truncate text-sm font-medium text-stone-100">
                    {{ node.session.title }}
                  </p>
                  <Pin
                    v-if="isPinned"
                    class="size-3.5 shrink-0 text-amber-200"
                  />
                  <LoaderCircle
                    v-if="node.session.status === 'streaming'"
                    class="size-3.5 shrink-0 animate-spin text-amber-300"
                  />
                </div>
                <div
                  class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-[11px] text-stone-500"
                >
                  <span v-if="node.session.branch">{{
                    node.session.branch
                  }}</span>
                  <span>{{ formatRelativeTime(node.session.updatedAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </button>

        <div
          v-if="!isEditing"
          class="mt-0.5 hidden shrink-0 items-center gap-1 group-hover:flex"
        >
          <Button
            variant="ghost"
            size="icon"
            class="size-7 rounded-full text-stone-500 hover:text-amber-100"
            @click.stop="emit('togglePin', node.session.id)"
          >
            <Pin
              class="size-3.5"
              :class="isPinned ? 'fill-current text-amber-200' : ''"
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="size-7 rounded-full text-stone-500 hover:text-stone-100"
            @click.stop="emit('createChild', node.session.id, node.session.cwd)"
          >
            <GitBranchPlus class="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            class="size-7 rounded-full text-stone-500 hover:text-stone-100"
            @click.stop="
              emit('startRename', node.session.id, node.session.title)
            "
          >
            <Pencil class="size-3.5" />
          </Button>

          <Button
            v-if="node.session.archived"
            variant="ghost"
            size="icon"
            class="size-7 rounded-full text-stone-500 hover:text-emerald-100"
            @click.stop="emit('archive', node.session.id, false)"
          >
            <ArchiveRestore class="size-3.5" />
          </Button>

          <Button
            v-else
            variant="ghost"
            size="icon"
            class="size-7 rounded-full text-stone-500 hover:text-stone-100"
            @click.stop="emit('archive', node.session.id, true)"
          >
            <Archive class="size-3.5" />
          </Button>

          <Button
            v-if="node.session.archived"
            variant="ghost"
            size="icon"
            class="size-7 rounded-full text-stone-500 hover:text-red-200"
            @click.stop="emit('remove', node.session.id)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </div>
      </div>
    </div>

    <div v-if="hasChildren && isExpanded" class="space-y-1">
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
        @start-rename="
          (sessionId, currentTitle) =>
            emit('startRename', sessionId, currentTitle)
        "
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
