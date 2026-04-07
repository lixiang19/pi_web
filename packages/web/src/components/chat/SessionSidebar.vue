<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FolderGit2,
  FolderKanban,
  PanelLeft,
  Plus,
  Search,
} from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import SessionSidebarSessionNode from "@/components/chat/SessionSidebarSessionNode.vue";
import { buildSessionProjects } from "@/lib/session-sidebar";
import type { SessionSummary } from "@/lib/types";

const ACTIVE_NOW_TTL = 36 * 60 * 60 * 1000;

const props = defineProps<{
  sessions: SessionSummary[];
  activeSessionId: string;
  workspaceDir?: string;
  isSending: boolean;
}>();

const emit = defineEmits<{
  select: [sessionId: string];
  create: [payload: { cwd?: string; parentSessionId?: string }];
  prefetch: [sessionId: string];
  rename: [sessionId: string, title: string];
  archive: [sessionId: string, archived: boolean];
  remove: [sessionId: string];
}>();

const searchQuery = ref("");
const editingSessionId = ref("");
const editingTitle = ref("");

const collapsedProjects = useLocalStorage<Record<string, boolean>>(
  "pi.sessions.projectCollapse",
  {},
);
const collapsedGroups = useLocalStorage<Record<string, boolean>>(
  "pi.sessions.groupCollapse",
  {},
);
const expandedParents = useLocalStorage<string[]>(
  "pi.sessions.expandedParents",
  [],
);
const activeSessionByProject = useLocalStorage<Record<string, string>>(
  "pi.sessions.activeSessionByProject",
  {},
);
const pinnedSessionIds = useLocalStorage<string[]>("pi.sessions.pinned", []);
const activeNowEntries = useLocalStorage<Record<string, number>>(
  "pi.sessions.activeNow",
  {},
);

const relativeTimeFormatter = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});

const activeSession = computed(
  () =>
    props.sessions.find((session) => session.id === props.activeSessionId) ??
    null,
);

const projects = computed(() =>
  buildSessionProjects({
    sessions: props.sessions,
    pinnedIds: pinnedSessionIds.value,
    query: searchQuery.value,
    ...(props.workspaceDir ? { workspaceDir: props.workspaceDir } : {}),
  }),
);

const activeNowSessions = computed(() => {
  const sessionMap = new Map(
    props.sessions.map((session) => [session.id, session]),
  );
  const expiry = Date.now() - ACTIVE_NOW_TTL;

  return Object.entries(activeNowEntries.value)
    .filter(([, timestamp]) => timestamp >= expiry)
    .map(([sessionId, timestamp]) => ({
      session: sessionMap.get(sessionId),
      timestamp,
    }))
    .filter((item): item is { session: SessionSummary; timestamp: number } =>
      Boolean(item.session),
    )
    .filter((item) => !item.session.archived && !item.session.parentSessionId)
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((item) => item.session);
});

const currentProjectId = computed(() => activeSession.value?.projectId || "");

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

const isProjectCollapsed = (projectId: string) =>
  collapsedProjects.value[projectId] === true;

const toggleProject = (projectId: string) => {
  collapsedProjects.value = {
    ...collapsedProjects.value,
    [projectId]: !collapsedProjects.value[projectId],
  };
};

const isGroupCollapsed = (groupKey: string, defaultCollapsed: boolean) => {
  if (groupKey in collapsedGroups.value) {
    return collapsedGroups.value[groupKey] === true;
  }

  return defaultCollapsed;
};

const toggleGroup = (groupKey: string, defaultCollapsed: boolean) => {
  collapsedGroups.value = {
    ...collapsedGroups.value,
    [groupKey]: !isGroupCollapsed(groupKey, defaultCollapsed),
  };
};

const toggleExpandedParent = (sessionId: string) => {
  const next = new Set(expandedParents.value);
  if (next.has(sessionId)) {
    next.delete(sessionId);
  } else {
    next.add(sessionId);
  }

  expandedParents.value = [...next];
};

const togglePin = (sessionId: string) => {
  const next = new Set(pinnedSessionIds.value);
  if (next.has(sessionId)) {
    next.delete(sessionId);
  } else {
    next.add(sessionId);
  }

  pinnedSessionIds.value = [...next];
};

const openProject = (projectId: string) => {
  const project = projects.value.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  const preferredSessionId = activeSessionByProject.value[projectId];
  const candidate =
    project.sessions.find((session) => session.id === preferredSessionId) ??
    project.sessions.find((session) => !session.archived) ??
    project.sessions[0];

  if (candidate && candidate.id !== props.activeSessionId) {
    emit("select", candidate.id);
  }
};

const startRename = (sessionId: string, currentTitle: string) => {
  editingSessionId.value = sessionId;
  editingTitle.value = currentTitle;
};

const cancelRename = () => {
  editingSessionId.value = "";
  editingTitle.value = "";
};

const saveRename = (sessionId: string) => {
  const nextTitle = editingTitle.value.trim();
  if (!nextTitle) {
    return;
  }

  cancelRename();
  emit("rename", sessionId, nextTitle);
};

const removeSession = (sessionId: string) => {
  if (!window.confirm("会永久删除该会话以及它的全部子会话，继续吗？")) {
    return;
  }

  emit("remove", sessionId);
};

const updateEditingTitle = (value: string) => {
  editingTitle.value = value;
};

watch(
  activeSession,
  (session) => {
    if (!session) {
      return;
    }

    activeSessionByProject.value = {
      ...activeSessionByProject.value,
      [session.projectId]: session.id,
    };
  },
  { immediate: true },
);

watch(
  () => props.sessions,
  (sessions) => {
    const sessionIds = new Set(sessions.map((session) => session.id));
    const nextEntries = { ...activeNowEntries.value };
    const expiry = Date.now() - ACTIVE_NOW_TTL;

    for (const [sessionId, timestamp] of Object.entries(nextEntries)) {
      const session = sessions.find((item) => item.id === sessionId);
      if (
        !session ||
        session.archived ||
        session.parentSessionId ||
        timestamp < expiry
      ) {
        delete nextEntries[sessionId];
      }
    }

    for (const session of sessions) {
      if (
        session.status === "streaming" &&
        !session.archived &&
        !session.parentSessionId
      ) {
        nextEntries[session.id] = Date.now();
      }
    }

    for (const sessionId of Object.keys(activeSessionByProject.value)) {
      const rememberedSessionId = activeSessionByProject.value[sessionId];
      if (rememberedSessionId && !sessionIds.has(rememberedSessionId)) {
        const next = { ...activeSessionByProject.value };
        delete next[sessionId];
        activeSessionByProject.value = next;
      }
    }

    pinnedSessionIds.value = pinnedSessionIds.value.filter((sessionId) =>
      sessionIds.has(sessionId),
    );
    expandedParents.value = expandedParents.value.filter((sessionId) =>
      sessionIds.has(sessionId),
    );
    activeNowEntries.value = nextEntries;
  },
  { immediate: true, deep: true },
);
</script>

<template>
  <div
    class="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-black/35 backdrop-blur"
  >
    <div class="border-b border-white/10 px-4 py-4">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div
            class="rounded-2xl border border-white/10 bg-white/[0.05] p-2 text-amber-200"
          >
            <PanelLeft class="size-4" />
          </div>
          <div>
            <p class="text-sm font-semibold text-stone-100">对话列表</p>
            <p class="text-xs text-stone-500">项目、worktree、子会话与归档</p>
          </div>
        </div>

        <Button
          class="rounded-full px-4"
          :disabled="isSending"
          @click="emit('create', {})"
        >
          <Plus class="size-4" />
          新建
        </Button>
      </div>

      <div class="relative mt-4">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-500"
        />
        <Input
          v-model="searchQuery"
          class="border-white/10 bg-white/[0.04] pl-10 text-stone-100 placeholder:text-stone-500"
          placeholder="搜索会话、目录或分组"
        />
      </div>
    </div>

    <ScrollArea class="flex-1 px-3 py-3">
      <div class="space-y-5 pb-4">
        <section v-if="activeNowSessions.length > 0" class="space-y-2">
          <div
            class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500"
          >
            <Clock3 class="size-3.5" />
            recent
          </div>

          <div class="space-y-2">
            <button
              v-for="session in activeNowSessions"
              :key="session.id"
              type="button"
              class="w-full rounded-2xl border px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.06]"
              :class="
                session.id === activeSessionId
                  ? 'border-amber-400/35 bg-amber-500/10'
                  : 'border-white/10 bg-white/[0.03]'
              "
              @mouseenter="emit('prefetch', session.id)"
              @focus="emit('prefetch', session.id)"
              @click="emit('select', session.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-stone-100">
                    {{ session.title }}
                  </p>
                  <p class="mt-1 truncate text-xs text-stone-500">
                    {{ session.projectLabel }}
                  </p>
                </div>
                <span class="shrink-0 text-[11px] text-stone-500">{{
                  formatRelativeTime(session.updatedAt)
                }}</span>
              </div>
            </button>
          </div>
        </section>

        <section class="space-y-3">
          <div
            class="flex items-center gap-2 px-1 text-[11px] uppercase tracking-[0.28em] text-stone-500"
          >
            <FolderKanban class="size-3.5" />
            项目分组
          </div>

          <div
            v-if="projects.length === 0"
            class="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-stone-500"
          >
            当前没有匹配的会话。
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="project in projects"
              :key="project.id"
              class="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
            >
              <div class="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  @click="openProject(project.id)"
                >
                  <div class="flex items-center gap-2">
                    <FolderGit2 class="size-4 text-amber-200" />
                    <p class="truncate text-sm font-medium text-stone-100">
                      {{ project.label }}
                    </p>
                    <Badge
                      variant="outline"
                      class="border-white/10 bg-transparent text-[10px] text-stone-400"
                    >
                      {{ project.sessions.length }}
                    </Badge>
                    <Badge
                      v-if="project.id === currentProjectId"
                      variant="outline"
                      class="border-amber-400/20 bg-amber-500/10 text-[10px] text-amber-100"
                    >
                      当前
                    </Badge>
                  </div>
                  <p class="mt-1 truncate pl-6 text-[11px] text-stone-500">
                    {{ project.pathLabel }}
                  </p>
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8 rounded-full text-stone-500 hover:text-stone-100"
                  @click="toggleProject(project.id)"
                >
                  <component
                    :is="
                      isProjectCollapsed(project.id)
                        ? ChevronRight
                        : ChevronDown
                    "
                    class="size-4"
                  />
                </Button>
              </div>

              <div
                v-if="!isProjectCollapsed(project.id)"
                class="space-y-3 border-t border-white/10 px-3 py-3"
              >
                <section
                  v-for="group in project.groups"
                  :key="group.key"
                  class="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <div class="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-left"
                      @click="toggleGroup(group.key, group.kind === 'archived')"
                    >
                      <div class="flex items-center gap-2">
                        <p class="truncate text-sm font-medium text-stone-200">
                          {{ group.label }}
                        </p>
                        <span
                          v-if="group.branch"
                          class="truncate text-[11px] text-stone-500"
                          >{{ group.branch }}</span
                        >
                      </div>
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7 rounded-full text-stone-500 hover:text-stone-100"
                      @click="toggleGroup(group.key, group.kind === 'archived')"
                    >
                      <component
                        :is="
                          isGroupCollapsed(group.key, group.kind === 'archived')
                            ? ChevronRight
                            : ChevronDown
                        "
                        class="size-4"
                      />
                    </Button>
                  </div>

                  <div
                    v-if="
                      !isGroupCollapsed(group.key, group.kind === 'archived')
                    "
                    class="space-y-1 border-t border-white/10 px-2 py-2"
                  >
                    <SessionSidebarSessionNode
                      v-for="node in group.tree"
                      :key="node.session.id"
                      :node="node"
                      :depth="0"
                      :active-session-id="activeSessionId"
                      :editing-session-id="editingSessionId"
                      :editing-title="editingTitle"
                      :expanded-parent-ids="expandedParents"
                      :pinned-session-ids="pinnedSessionIds"
                      @select="emit('select', $event)"
                      @prefetch="emit('prefetch', $event)"
                      @toggle-expand="toggleExpandedParent"
                      @start-rename="
                        (sessionId, currentTitle) =>
                          startRename(sessionId, currentTitle)
                      "
                      @update-editing-title="updateEditingTitle"
                      @save-rename="saveRename"
                      @cancel-rename="cancelRename"
                      @toggle-pin="togglePin"
                      @create-child="
                        (sessionId, cwd) =>
                          emit('create', { parentSessionId: sessionId, cwd })
                      "
                      @archive="
                        (sessionId, archived) =>
                          emit('archive', sessionId, archived)
                      "
                      @remove="removeSession"
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
