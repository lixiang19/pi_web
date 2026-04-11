<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLocalStorage } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Search,
  Settings,
} from "lucide-vue-next";
import SessionSidebarSessionNode from "@/components/chat/SessionSidebarSessionNode.vue";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useProjects } from "@/composables/useProjects";
import {
  buildSessionProjects,
  formatRelativeProjectPath,
} from "@/lib/session-sidebar";
import type { ProjectItem, SessionSummary } from "@/lib/types";

const MAX_RECENT_SESSIONS = 10;
const DEFAULT_VISIBLE_SESSION_COUNT = 3;
const RECENT_GROUP_KEY = "__recent__";

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

const searchQuery = ref("");
const editingSessionId = ref("");
const editingTitle = ref("");
const expandedGroupKeys = ref<string[]>([]);

const collapsedProjects = useLocalStorage<Record<string, boolean>>(
  "pi.sessions.projectCollapse",
  {},
);
const recentSessionIds = useLocalStorage<string[]>("pi.sessions.recent", []);

const projectState = useProjects();
const {
  add: addProjectToList,
  error: projectError,
  isLoading: isProjectLoading,
  load: loadProjects,
  projects: storedProjects,
} = projectState;

const isProjectDialogOpen = ref(false);
const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());
const isSearching = computed(() => normalizedQuery.value.length > 0);

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const createEmptyProjectView = (project: ProjectItem) => ({
  id: `stored:${project.id}`,
  label: project.name,
  projectRoot: normalizePath(project.path),
  pathLabel: formatRelativeProjectPath(project.path, props.workspaceDir),
  lastUpdatedAt: project.addedAt,
  sessions: [],
  groups: [],
});

const projects = computed(() => {
  const sessionProjects = buildSessionProjects({
    sessions: props.sessions,
    query: normalizedQuery.value,
    ...(props.workspaceDir ? { workspaceDir: props.workspaceDir } : {}),
  });

  const mergedProjects = new Map(
    sessionProjects.map((project) => [normalizePath(project.projectRoot), project]),
  );

  for (const project of storedProjects.value) {
    const normalizedProjectPath = normalizePath(project.path);
    if (mergedProjects.has(normalizedProjectPath)) {
      continue;
    }

    const query = normalizedQuery.value;
    const matchesQuery =
      !query ||
      `${project.name} ${normalizedProjectPath}`.toLowerCase().includes(query);

    if (!matchesQuery) {
      continue;
    }

    mergedProjects.set(normalizedProjectPath, createEmptyProjectView(project));
  }

  return [...mergedProjects.values()].sort(
    (left, right) => right.lastUpdatedAt - left.lastUpdatedAt,
  );
});

const recentSessions = computed(() => {
  const sessionMap = new Map(
    props.sessions.map((session) => [session.id, session]),
  );

  return recentSessionIds.value
    .map((id) => sessionMap.get(id))
    .filter((session): session is SessionSummary => Boolean(session))
    .filter((session) => !session.archived)
    .slice(0, MAX_RECENT_SESSIONS);
});

const isProjectCollapsed = (projectId: string) =>
  collapsedProjects.value[projectId] === true;

const isGroupExpanded = (groupKey: string) =>
  expandedGroupKeys.value.includes(groupKey);

const getVisibleCount = (total: number, groupKey: string) => {
  if (isSearching.value || isGroupExpanded(groupKey)) {
    return total;
  }

  return Math.min(total, DEFAULT_VISIBLE_SESSION_COUNT);
};

const getVisibleNodes = <T>(nodes: T[], groupKey: string) =>
  nodes.slice(0, getVisibleCount(nodes.length, groupKey));

const getHiddenCount = (total: number, groupKey: string) =>
  Math.max(0, total - getVisibleCount(total, groupKey));

const toggleGroupExpansion = (groupKey: string) => {
  if (isGroupExpanded(groupKey)) {
    expandedGroupKeys.value = expandedGroupKeys.value.filter(
      (key) => key !== groupKey,
    );
    return;
  }

  expandedGroupKeys.value = [...expandedGroupKeys.value, groupKey];
};

const recordRecentSession = (sessionId: string) => {
  const current = new Set(recentSessionIds.value);
  current.delete(sessionId);
  recentSessionIds.value = [sessionId, ...current].slice(0, MAX_RECENT_SESSIONS);
};

const openProjectDialog = () => {
  isProjectDialogOpen.value = true;
};

const handleAddProject = async (projectPath: string) => {
  const project = await addProjectToList(projectPath);
  if (!project) return;
  isProjectDialogOpen.value = false;
};

const toggleProject = (projectId: string) => {
  collapsedProjects.value = {
    ...collapsedProjects.value,
    [projectId]: !collapsedProjects.value[projectId],
  };
};

const handleSelect = (sessionId: string) => {
  recordRecentSession(sessionId);
  emit("select", sessionId);
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

watch(
  () => props.activeSessionId,
  (sessionId) => {
    if (sessionId) {
      recordRecentSession(sessionId);
    }
  },
  { immediate: true },
);

watch(
  () => props.sessions,
  (sessions) => {
    recentSessionIds.value = recentSessionIds.value.filter((sessionId) => {
      const session = sessions.find((item) => item.id === sessionId);
      return session && !session.archived;
    });
  },
  { immediate: true, deep: true },
);

onMounted(() => {
  void loadProjects().catch(() => undefined);
});
</script>

<template>
  <SidebarProvider class="h-full min-h-0 w-full" :default-open="true">
    <Sidebar collapsible="none" class="w-full border-r-0 bg-sidebar">
      <SidebarHeader class="px-4 pt-5 pb-2">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <span class="text-[11px] font-bold italic text-primary-foreground">R</span>
            </div>
            <span class="text-sm font-bold tracking-tight text-sidebar-foreground">ridge</span>
          </div>
          <div class="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="添加项目"
                  :disabled="isProjectLoading"
                  @click="openProjectDialog"
                >
                  <Folder class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center">
                <p>添加项目</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="新建会话"
                  :disabled="isSending"
                  @click="emit('create', {})"
                >
                  <Plus class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center">
                <p>新建会话</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div class="group relative">
          <Search
            class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40"
          />
          <Input
            v-model="searchQuery"
            placeholder="搜索会话..."
            class="h-8 rounded-md border-none bg-sidebar-accent/50 pl-9 text-[13px] shadow-none transition-colors placeholder:text-sidebar-foreground/30 hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:ring-1"
          />
        </div>
      </SidebarHeader>

      <SidebarContent class="px-2">
        <SidebarGroup v-if="recentSessions.length > 0 && !isSearching">
          <SidebarGroupLabel class="px-2">最近访问</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SessionSidebarSessionNode
                v-for="session in getVisibleNodes(recentSessions, RECENT_GROUP_KEY)"
                :key="`recent-${session.id}`"
                :node="{ session, children: [] }"
                :depth="0"
                :active-session-id="activeSessionId"
                :editing-session-id="editingSessionId"
                :editing-title="editingTitle"
                :expanded-parent-ids="[]"
                @select="handleSelect"
                @prefetch="emit('prefetch', $event)"
                @start-rename="startRename"
                @update-editing-title="updateEditingTitle"
                @save-rename="saveRename"
                @cancel-rename="cancelRename"
                @remove="removeSession"
              />
            </SidebarMenu>
            <div
              v-if="getHiddenCount(recentSessions.length, RECENT_GROUP_KEY) > 0"
              class="px-2 pt-1"
            >
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[12px] text-sidebar-foreground/60 hover:text-sidebar-foreground"
                @click="toggleGroupExpansion(RECENT_GROUP_KEY)"
              >
                展开更多（还有 {{ getHiddenCount(recentSessions.length, RECENT_GROUP_KEY) }} 条）
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel class="px-2">
            {{ isSearching ? "搜索结果" : "浏览项目" }}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div v-if="projects.length === 0" class="py-12 text-center">
              <p class="text-[12px] text-sidebar-foreground/30">无会话记录</p>
            </div>

            <SidebarMenu v-else class="space-y-1">
              <div v-for="project in projects" :key="project.id" class="space-y-0.5">
                <SidebarMenuItem>
                  <div class="flex items-center gap-1">
                    <SidebarMenuButton
                      as-child
                      :is-active="false"
                      class="min-w-0 flex-1 hover:bg-sidebar-accent/40"
                    >
                      <button type="button" class="flex w-full items-center gap-2" @click="toggleProject(project.id)">
                        <component
                          :is="isProjectCollapsed(project.id) ? ChevronRight : ChevronDown"
                          class="size-3.5 shrink-0 text-sidebar-foreground/40 transition-transform"
                        />
                        <span class="truncate text-[13px] font-bold tracking-tight text-sidebar-foreground/80 uppercase">
                          {{ project.label }}
                        </span>
                      </button>
                    </SidebarMenuButton>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="h-7 shrink-0 px-2 text-[12px] font-medium text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      @click="emit('create', { cwd: project.projectRoot })"
                    >
                      新建会话
                    </Button>
                  </div>

                  <div v-if="!isProjectCollapsed(project.id)" class="mt-0.5 ml-1">
                    <div
                      v-if="project.groups.length === 0"
                      class="mx-2 rounded-md bg-sidebar-accent/20 px-3 py-3"
                    >
                      <p class="text-[12px] text-sidebar-foreground/50">暂无会话</p>
                    </div>

                    <template v-for="group in project.groups" :key="group.key">
                      <div
                        v-if="group.kind !== 'project-root'"
                        class="px-2 py-1.5 text-[10px] font-bold tracking-wider text-sidebar-foreground/25 uppercase"
                      >
                        {{ group.label }}
                      </div>

                      <div
                        v-for="node in getVisibleNodes(group.tree, group.key)"
                        :key="node.session.id"
                      >
                        <SessionSidebarSessionNode
                          :node="node"
                          :depth="1"
                          :active-session-id="activeSessionId"
                          :editing-session-id="editingSessionId"
                          :editing-title="editingTitle"
                          :expanded-parent-ids="[]"
                          @select="handleSelect"
                          @prefetch="emit('prefetch', $event)"
                          @start-rename="startRename"
                          @update-editing-title="updateEditingTitle"
                          @save-rename="saveRename"
                          @cancel-rename="cancelRename"
                          @remove="removeSession"
                        />
                      </div>

                      <div
                        v-if="getHiddenCount(group.tree.length, group.key) > 0"
                        class="px-2 pb-1"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-7 px-2 text-[12px] text-sidebar-foreground/60 hover:text-sidebar-foreground"
                          @click="toggleGroupExpansion(group.key)"
                        >
                          展开更多（还有 {{ getHiddenCount(group.tree.length, group.key) }} 条）
                        </Button>
                      </div>
                    </template>
                  </div>
                </SidebarMenuItem>
              </div>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter class="px-4 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              class="w-full justify-start gap-3 rounded-md text-sidebar-foreground/50 transition-all hover:bg-sidebar-accent hover:text-sidebar-foreground"
              @click="router.push('/settings')"
            >
              <Settings class="size-4" />
              <span class="text-[13px] font-medium">设置</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    <ProjectSelectorDialog
      v-model:open="isProjectDialogOpen"
      :pending="isProjectLoading"
      :error="projectError"
      @confirm="handleAddProject"
    />
  </SidebarProvider>
</template>
