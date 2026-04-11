<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLocalStorage } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Settings,
  Folder,
} from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import SessionSidebarSessionNode from "@/components/chat/SessionSidebarSessionNode.vue";
import { useProjects } from "@/composables/useProjects";
import { buildSessionProjects } from "@/lib/session-sidebar";
import type { SessionSummary } from "@/lib/types";

const MAX_RECENT_SESSIONS = 10;
const router = useRouter();

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

// Search
const searchQuery = ref("");

// Local state
const editingSessionId = ref("");
const editingTitle = ref("");

const collapsedProjects = useLocalStorage<Record<string, boolean>>(
  "pi.sessions.projectCollapse",
  {}
);

const pinnedSessionIds = useLocalStorage<string[]>("pi.sessions.pinned", []);

// Recent sessions: ordered list of session IDs (most recent first)
const recentSessionIds = useLocalStorage<string[]>(
  "pi.sessions.recent",
  []
);

// Projects
const projectState = useProjects();
const {
  add: addProjectToList,
  error: projectError,
  isLoading: isProjectLoading,
  load: loadProjects,
} = projectState;

const isProjectDialogOpen = ref(false);

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());

// Build projects with search filter
const projects = computed(() =>
  buildSessionProjects({
    sessions: props.sessions,
    pinnedIds: pinnedSessionIds.value,
    query: normalizedQuery.value,
    ...(props.workspaceDir ? { workspaceDir: props.workspaceDir } : {}),
  })
);

// Recent sessions: get session objects from stored IDs
const recentSessions = computed(() => {
  const sessionMap = new Map(
    props.sessions.map((session) => [session.id, session])
  );
  
  return recentSessionIds.value
    .map((id) => sessionMap.get(id))
    .filter((session): session is SessionSummary => Boolean(session))
    .filter((session) => !session.archived)
    .slice(0, MAX_RECENT_SESSIONS);
});

// Record a session as recently accessed
const recordRecentSession = (sessionId: string) => {
  const current = new Set(recentSessionIds.value);
  // Remove if exists (will be added to front)
  current.delete(sessionId);
  // Add to front
  recentSessionIds.value = [sessionId, ...current].slice(0, MAX_RECENT_SESSIONS);
};

// Actions
const openProjectDialog = () => {
  isProjectDialogOpen.value = true;
};

const handleAddProject = async (projectPath: string) => {
  const project = await addProjectToList(projectPath);
  if (!project) return;
  isProjectDialogOpen.value = false;
};



const isProjectCollapsed = (projectId: string) =>
  collapsedProjects.value[projectId] === true;

const toggleProject = (projectId: string) => {
  collapsedProjects.value = {
    ...collapsedProjects.value,
    [projectId]: !collapsedProjects.value[projectId],
  };
};

// Handle session selection with recent tracking
const handleSelect = (sessionId: string) => {
  recordRecentSession(sessionId);
  emit("select", sessionId);
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
  if (!nextTitle) return;
  cancelRename();
  emit("rename", sessionId, nextTitle);
};

const removeSession = (sessionId: string) => {
  if (!window.confirm("确定删除该会话？")) return;
  emit("remove", sessionId);
};

const updateEditingTitle = (value: string) => {
  editingTitle.value = value;
};

// Watchers

// Watch active session to record recent access
watch(
  () => props.activeSessionId,
  (sessionId) => {
    if (sessionId) {
      recordRecentSession(sessionId);
    }
  },
  { immediate: true }
);

watch(
  () => props.sessions,
  (sessions) => {
    const sessionIds = new Set(sessions.map((session) => session.id));
    
    // Clean up pinned list: remove deleted sessions
    pinnedSessionIds.value = pinnedSessionIds.value.filter((sessionId) =>
      sessionIds.has(sessionId)
    );
    
    // Clean up recent list: remove deleted or archived sessions
    recentSessionIds.value = recentSessionIds.value.filter((sessionId) => {
      const session = sessions.find((s) => s.id === sessionId);
      return session && !session.archived;
    });
  },
  { immediate: true, deep: true }
);

onMounted(() => {
  void loadProjects().catch(() => undefined);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[#fbfbfa] dark:bg-[#191919]">
    <!-- Header -->
    <div class="shrink-0 px-3 pt-4 pb-2">
      <div class="mb-3 flex items-center justify-between px-2">
        <h2 class="text-[11px] font-bold uppercase tracking-wider text-foreground/40">会话</h2>
        <div class="flex items-center gap-0.5">
          <button
            class="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
            title="添加项目"
            :disabled="isProjectLoading"
            @click="openProjectDialog"
          >
            <Folder class="size-4" />
          </button>
          <button
            class="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
            title="新建会话"
            :disabled="isSending"
            @click="emit('create', {})"
          >
            <Plus class="size-4" />
          </button>
        </div>
      </div>

      <div class="relative group px-1">
        <Search
          class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50"
        />
        <Input
          v-model="searchQuery"
          placeholder="搜索会话..."
          class="h-8 border-none bg-accent/40 hover:bg-accent/60 focus-visible:ring-1 focus-visible:bg-background transition-colors pl-9 text-[13px] rounded-md shadow-none"
        />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2">
      <!-- Recent Section -->
      <section v-if="recentSessions.length > 0 && !searchQuery" class="mb-6">
        <div class="mb-1 flex items-center gap-2 px-3">
          <span class="text-[11px] font-bold uppercase tracking-wider text-foreground/40">最近访问</span>
        </div>
        <div class="space-y-0.5">
          <SessionSidebarSessionNode
            v-for="session in recentSessions"
            :key="`recent-${session.id}`"
            :node="{ session, children: [] }"
            :depth="0"
            :active-session-id="activeSessionId"
            :editing-session-id="editingSessionId"
            :editing-title="editingTitle"
            :expanded-parent-ids="[]"
            :pinned-session-ids="pinnedSessionIds"
            @select="handleSelect"
            @prefetch="emit('prefetch', $event)"
            @start-rename="startRename"
            @update-editing-title="updateEditingTitle"
            @save-rename="saveRename"
            @cancel-rename="cancelRename"
            @toggle-pin="togglePin"
            @remove="removeSession"
          />
        </div>
      </section>

      <!-- Projects Section -->
      <section class="min-h-0">
        <div class="mb-1 flex items-center gap-2 px-3">
          <span class="text-[11px] font-bold uppercase tracking-wider text-foreground/40">
            {{ searchQuery ? "搜索结果" : "浏览项目" }}
          </span>
        </div>

        <div v-if="projects.length === 0" class="py-12 text-center">
          <p class="text-[12px] text-muted-foreground/50">无会话记录</p>
        </div>

        <div v-else class="space-y-4 pb-4">
          <div v-for="project in projects" :key="project.id" class="space-y-0.5">
            <div class="group relative flex items-center gap-1 rounded-md px-2 py-1 hover:bg-[#efefee] dark:hover:bg-[#202020] transition-colors">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                @click="toggleProject(project.id)"
              >
                <component
                  :is="isProjectCollapsed(project.id) ? ChevronRight : ChevronDown"
                  class="size-3.5 shrink-0 text-muted-foreground/60 transition-transform"
                />
                <div class="min-w-0">
                  <p class="truncate text-[13px] font-semibold text-foreground/90">
                    {{ project.label }}
                  </p>
                </div>
              </button>
              <button
                type="button"
                class="rounded p-1 text-muted-foreground/40 opacity-0 transition-opacity hover:text-foreground hover:bg-background/50 group-hover:opacity-100 shadow-sm border border-transparent hover:border-border/10"
                title="在该项目下新建会话"
                @click="emit('create', { cwd: project.projectRoot })"
              >
                <Plus class="size-3.5" />
              </button>
            </div>

            <div v-if="!isProjectCollapsed(project.id)" class="mt-0.5">
              <template v-for="group in project.groups" :key="group.key">
                <div
                  v-if="group.kind !== 'project-root'"
                  class="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/30"
                >
                  {{ group.label }}
                </div>

                <div v-for="node in group.tree" :key="node.session.id">
                  <SessionSidebarSessionNode
                    :node="node"
                    :depth="1"
                    :active-session-id="activeSessionId"
                    :editing-session-id="editingSessionId"
                    :editing-title="editingTitle"
                    :expanded-parent-ids="[]"
                    :pinned-session-ids="pinnedSessionIds"
                    @select="handleSelect"
                    @prefetch="emit('prefetch', $event)"
                    @start-rename="startRename"
                    @update-editing-title="updateEditingTitle"
                    @save-rename="saveRename"
                    @cancel-rename="cancelRename"
                    @toggle-pin="togglePin"
                    @remove="removeSession"
                  />
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Footer -->
    <div class="shrink-0 px-4 py-3">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-foreground/60 transition-all hover:bg-[#efefee] dark:hover:bg-[#202020] hover:text-foreground"
        @click="router.push('/settings')"
      >
        <Settings class="size-4 opacity-70" />
        <span>设置</span>
      </button>
    </div>

    <ProjectSelectorDialog
      v-model:open="isProjectDialogOpen"
      :pending="isProjectLoading"
      :error="projectError"
      @confirm="handleAddProject"
    />
  </div>
</template>
