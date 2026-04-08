<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjects } from "@/composables/useProjects";
import SessionSidebarSessionNode from "@/components/chat/SessionSidebarSessionNode.vue";
import { buildSessionProjects } from "@/lib/session-sidebar";
import type { ProjectItem, SessionSummary } from "@/lib/types";
const ACTIVE_NOW_TTL = 36 * 60 * 60 * 100;
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
const projectState = useProjects();
const {
  add: addProjectToList,
  error: projectError,
  isLoading: isProjectLoading,
  load: loadProjects,
  projects: customProjects,
  remove: removeProjectFromList,
} = projectState;
const isProjectDialogOpen = ref(false);
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
const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");
const formatProjectPathSummary = (projectPath: string) => {
  const normalizedProjectPath = normalizePath(projectPath);
  const parentPath = normalizedProjectPath.split("/").slice(0, -1).join("/") || "/";

  if (!props.workspaceDir) {
    return parentPath;
  }

  const normalizedWorkspaceDir = normalizePath(props.workspaceDir);
  if (
    normalizedWorkspaceDir &&
    normalizedProjectPath.startsWith(normalizedWorkspaceDir)
  ) {
    const relative = parentPath.slice(normalizedWorkspaceDir.length).replace(/^\//, "");
    return relative || ".";
  }

  return parentPath;
};
const openProjectDialog = () => {
  isProjectDialogOpen.value = true;
};
const handleAddProject = async (projectPath: string) => {
  const project = await addProjectToList(projectPath);
  if (!project) {
    return;
  }

  isProjectDialogOpen.value = false;
};
const openProject = (project: ProjectItem) => {
  emit("create", { cwd: project.path });
};
const removeProject = async (project: ProjectItem) => {
  if (!window.confirm(`从项目列表移除 ${project.name}？`)) {
    return;
  }

  await removeProjectFromList(project.id);
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
onMounted(() => {
  void loadProjects().catch(() => undefined);
});
</script>
<template>
  <div
    class="flex h-full flex-col overflow-hidden bg-background"
  >
    <div class="px-4 py-3 border-b">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-sidebar-foreground/80">
        会话
        </p>
        <button
          class="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          :disabled="isSending"
          @click="emit('create', {})"
        >
          <Plus class="size-3.5" />
        新建
        </button>
      </div>
    </div>
    <ScrollArea class="flex-1 px-3 py-2 scrollbar-thin">
      <div class="space-y-6 pb-4">
        <section class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <p class="text-xs font-medium text-muted-foreground">自定义项目</p>
            <Button variant="ghost" size="sm" :disabled="isProjectLoading" @click="openProjectDialog">
              <Plus data-icon="inline-start" />
              添加项目
            </Button>
          </div>
          <div v-if="projectError" class="px-1 text-xs text-destructive">
            {{ projectError }}
          </div>
          <div v-if="customProjects.length === 0" class="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
            暂无项目，点击右上角添加。
          </div>
          <div v-else class="space-y-1">
            <div
              v-for="project in customProjects"
              :key="project.id"
              class="group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent/50"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                :title="project.path"
                @click="openProject(project)"
              >
                <p class="truncate text-sm font-medium text-sidebar-foreground">{{ project.name }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ formatProjectPathSummary(project.path) }}</p>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                class="opacity-0 transition-opacity group-hover:opacity-100"
                :disabled="isProjectLoading"
                @click.stop="removeProject(project)"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        </section>
        <!-- Recent Sessions -->
        <section v-if="activeNowSessions.length > 0" class="space-y-2">
          <div class="px-1 text-xs font-medium text-muted-foreground/70">
           最近访问
          </div>
          <div class="space-y-0.5">
            <button
              v-for="session in activeNowSessions"
              :key="session.id"
              type="button"
              class="group relative flex w-full items-center gap-2 px-2 py-2 text-left rounded-md transition-colors"
              :class="session.id === activeSessionId ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/50'"
              @mouseenter="emit('prefetch', session.id)"
              @click="emit('select', session.id)"
            >
              <!-- Active Indicator -->
              <div
                v-if="session.id === activeSessionId"
                class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
              />
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm font-medium" :class="session.id === activeSessionId ? 'text-sidebar-foreground' : 'text-sidebar-foreground/90'">
                  {{ session.title || '无标题' }}
                </p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-xs text-muted-foreground/70">{{ session.projectId }}</span>
                  <span class="text-xs text-muted-foreground/60 tabular-nums">
                    {{ formatRelativeTime(activeNowEntries[session.id] ?? session.updatedAt) }}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </section>
        <!-- Projects -->
        <section class="space-y-4">
          <div class="px-1 text-xs font-medium text-muted-foreground/70">
           浏览
          </div>
          <div v-if="projects.length === 0" class="py-8 text-center">
            <p class="text-xs text-muted-foreground/50">暂无会话</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="project in projects" :key="project.id" class="space-y-1">
              <div class="flex items-center justify-between px-1 group/proj">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground/80 hover:text-sidebar-foreground transition-colors"
                  @click="toggleProject(project.id)"
                >
                  <component :is="isProjectCollapsed(project.id) ? ChevronRight : ChevronDown" class="size-3.5 text-muted-foreground/60 shrink-0" />
                  <span class="truncate">{{ project.id }}</span>
                </button>
                <button
                  class="size-6 flex items-center justify-center opacity-0 group-hover/proj:opacity-100 hover:text-primary transition-all rounded"
                  @click.stop="emit('create', { cwd: project.id })"
                >
                  <Plus class="size-4" />
                </button>
              </div>
              <div v-if="!isProjectCollapsed(project.id)" class="ml-4 space-y-2">
                <div v-for="group in project.groups" :key="group.key" class="space-y-1">
                  <button
                    type="button"
                    class="flex w-full items-center gap-1.5 px-1 py-1 text-xs font-medium text-muted-foreground/70 hover:text-muted-foreground/90 transition-colors rounded"
                    @click="toggleGroup(group.key, group.kind === 'archived')"
                  >
                    <component :is="isGroupCollapsed(group.key, group.kind === 'archived') ? ChevronRight : ChevronDown" class="size-3 text-muted-foreground/50" />
                    <span class="truncate">{{ group.label }}</span>
                  </button>
                  <div v-if="!isGroupCollapsed(group.key, group.kind === 'archived')" class="space-y-0.5">
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
                      @start-rename="startRename"
                      @update-editing-title="updateEditingTitle"
                      @save-rename="saveRename"
                      @cancel-rename="cancelRename"
                      @toggle-pin="togglePin"
                      @create-child="(sessionId, cwd) => emit('create', { parentSessionId: sessionId, cwd })"
                      @archive="(sessionId, archived) => emit('archive', sessionId, archived)"
                      @remove="removeSession"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
    <ProjectSelectorDialog
      v-model:open="isProjectDialogOpen"
      :pending="isProjectLoading"
      :error="projectError"
      @confirm="handleAddProject"
    />
  </div>
</template>
