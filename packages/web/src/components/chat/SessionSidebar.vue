<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useLocalStorage } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GitBranch,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-vue-next";
import SessionSidebarSessionNode from "@/components/chat/SessionSidebarSessionNode.vue";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import NewWorktreeDialog from "@/components/chat/NewWorktreeDialog.vue";
import DeleteWorktreeDialog from "@/components/chat/DeleteWorktreeDialog.vue";
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
import { useProjectWorktrees } from "@/composables/useProjectWorktrees";
import { buildSessionProjects } from "@/lib/session-sidebar";
import type { SessionSummary } from "@/lib/types";

const DEFAULT_VISIBLE_SESSION_COUNT = 3;
const RECENT_SESSION_STORAGE_KEY = "pi.sessions.recent";

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
  "worktree-created": [worktreePath: string];
}>();

const searchQuery = ref("");
const editingSessionId = ref("");
const editingTitle = ref("");
const expandedGroupKeys = ref<string[]>([]);

const collapsedProjects = useLocalStorage<Record<string, boolean>>(
  "pi.sessions.projectCollapse",
  {},
);

const projectState = useProjects();
const {
  add: addProjectToList,
  error: projectError,
  isLoading: isProjectLoading,
  load: loadProjects,
  projects: storedProjects,
} = projectState;

const worktreeState = useProjectWorktrees();

const isProjectDialogOpen = ref(false);
const isWorktreeDialogOpen = ref(false);
const worktreeDialogProjectId = ref("");
const worktreeDialogProjectRoot = ref("");
const isDeleteWorktreeDialogOpen = ref(false);
const deleteWorktreeProjectId = ref("");
const deleteWorktreeRoot = ref("");
const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());
const isSearching = computed(() => normalizedQuery.value.length > 0);

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const projects = computed(() => {
  return buildSessionProjects({
    sessions: props.sessions,
    storedProjects: storedProjects.value,
    availableWorktreesByProject: worktreeState.worktreesByProject.value,
    query: normalizedQuery.value,
    ...(props.workspaceDir ? { workspaceDir: props.workspaceDir } : {}),
  });
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

const openWorktreeDialog = (projectId: string, projectRoot: string) => {
  worktreeDialogProjectId.value = projectId;
  worktreeDialogProjectRoot.value = projectRoot;
  isWorktreeDialogOpen.value = true;
};

const handleWorktreeCreated = async (worktreePath: string) => {
  isWorktreeDialogOpen.value = false;
  // 刷新 worktree 列表
  if (worktreeDialogProjectId.value) {
    await worktreeState.refresh(worktreeDialogProjectId.value);
  }
  emit("worktree-created", worktreePath);
};

const handleDeleteWorktree = (projectId: string, worktreeRoot: string) => {
  deleteWorktreeProjectId.value = projectId;
  deleteWorktreeRoot.value = worktreeRoot;
  isDeleteWorktreeDialogOpen.value = true;
};

const handleWorktreeDeleted = async () => {
  await worktreeState.refresh(deleteWorktreeProjectId.value);
};

// 获取 project 对应的 stored project id（用于 worktree API）
const findStoredProjectId = (projectRoot: string): string | null => {
  const normalized = normalizePath(projectRoot);
  const stored = storedProjects.value.find(
    (p) => normalizePath(p.path) === normalized,
  );
  return stored?.id ?? null;
};


watch(
  () => props.sessions,
  () => {
    if (editingSessionId.value && !props.sessions.some((item) => item.id === editingSessionId.value)) {
      cancelRename();
    }
  },
  { immediate: true, deep: true },
);

// 加载 worktree 列表
watch(
  () => storedProjects.value,
  (projects) => {
    if (projects.length > 0) {
      const projectIds = projects.map((p) => p.id);
      void worktreeState.loadAll(projectIds);
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(RECENT_SESSION_STORAGE_KEY);
  }
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
            class="h-8 rounded-md border border-transparent bg-sidebar-accent/50 pl-9 text-[13px] shadow-none transition-all placeholder:text-sidebar-foreground/30 hover:bg-sidebar-accent focus-visible:border-sidebar-ring/50 focus-visible:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring/30"
          />
        </div>
      </SidebarHeader>

      <SidebarContent class="px-2">

        <SidebarGroup>
          <SidebarGroupLabel class="px-2">
            {{ isSearching ? "搜索结果" : "浏览项目" }}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div v-if="projects.length === 0" class="py-12 text-center">
              <p class="text-[12px] text-sidebar-foreground/30">无已添加项目</p>
            </div>

            <SidebarMenu v-else class="space-y-1">
              <div v-for="project in projects" :key="project.id" class="space-y-0.5">
                <SidebarMenuItem>
                  <div class="flex items-center gap-1">
                    <SidebarMenuButton
                      as-child
                      :is-active="false"
                      class="min-w-0 flex-1 pl-1.5 pr-2 hover:bg-sidebar-accent/40"
                    >
                      <button type="button" class="flex w-full items-center gap-1.5" @click="toggleProject(project.id)">
                        <component
                          :is="isProjectCollapsed(project.id) ? ChevronRight : ChevronDown"
                          class="size-3.5 shrink-0 text-sidebar-foreground/40 transition-transform"
                        />
                        <span class="truncate text-[13px] font-bold tracking-tight text-sidebar-foreground/80 uppercase">
                          {{ project.label }}
                        </span>
                      </button>
                    </SidebarMenuButton>
                    <div class="flex shrink-0 items-center gap-0.5">
                      <Tooltip v-if="findStoredProjectId(project.projectRoot) && project.isGit">
                        <TooltipTrigger as-child>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            class="text-sidebar-foreground/35 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            @click="openWorktreeDialog(findStoredProjectId(project.projectRoot)!, project.projectRoot)"
                          >
                            <GitBranch class="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>新建 worktree</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            class="text-sidebar-foreground/35 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            @click="emit('create', { cwd: project.projectRoot })"
                          >
                            <Plus class="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>新建会话</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <div v-if="!isProjectCollapsed(project.id)" class="mt-0.5">
                    <div
                      v-if="project.groups.length === 0"
                      class="mx-2 rounded-md bg-sidebar-accent/20 px-3 py-3"
                    >
                      <p class="text-[12px] text-sidebar-foreground/50">暂无会话</p>
                    </div>

                    <template v-for="group in project.groups" :key="group.key">
                      <!-- worktree / archived group header -->
                      <div
                        v-if="group.kind !== 'project-root'"
                        class="group/gh flex items-center justify-between pl-5 pr-2 py-1.5"
                      >
                        <span class="text-[10px] font-bold tracking-wider text-sidebar-foreground/25 uppercase">
                          {{ group.label }}
                        </span>
                        <div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/gh:opacity-100">
                          <!-- worktree group: 新建会话 + 删除 -->
                          <template v-if="group.kind === 'worktree'">
                            <Tooltip>
                              <TooltipTrigger as-child>
                                <button
                                  type="button"
                                  class="inline-flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                  @click="emit('create', { cwd: group.worktreeRoot })"
                                >
                                  <Plus class="size-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>新建会话</p></TooltipContent>
                            </Tooltip>
                            <Tooltip v-if="findStoredProjectId(project.projectRoot) && project.isGit">
                              <TooltipTrigger as-child>
                                <button
                                  type="button"
                                  class="inline-flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10"
                                  @click="handleDeleteWorktree(findStoredProjectId(project.projectRoot)!, group.worktreeRoot)"
                                >
                                  <Trash2 class="size-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>删除 worktree</p></TooltipContent>
                            </Tooltip>
                          </template>
                        </div>
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

                      <!-- 空 worktree group 提示 -->
                      <div
                        v-if="group.kind === 'worktree' && group.tree.length === 0"
                        class="mx-2 rounded-md bg-sidebar-accent/10 px-3 py-2"
                      >
                        <p class="text-[11px] text-sidebar-foreground/30">暂无会话</p>
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

    <NewWorktreeDialog
      v-model:open="isWorktreeDialogOpen"
      :project-id="worktreeDialogProjectId"
      :project-root="worktreeDialogProjectRoot"
      @created="handleWorktreeCreated"
    />

    <DeleteWorktreeDialog
      v-model:open="isDeleteWorktreeDialogOpen"
      :project-id="deleteWorktreeProjectId"
      :worktree-root="deleteWorktreeRoot"
      @deleted="handleWorktreeDeleted"
    />
  </SidebarProvider>
</template>
