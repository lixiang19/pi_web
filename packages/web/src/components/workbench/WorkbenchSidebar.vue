<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GitBranch,
  Plus,
} from "lucide-vue-next";
import SessionSidebarSessionNode from "@/components/chat/SessionSidebarSessionNode.vue";
import DeleteWorktreeDialog from "@/components/chat/DeleteWorktreeDialog.vue";
import NewWorktreeDialog from "@/components/chat/NewWorktreeDialog.vue";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useProjectWorktrees } from "@/composables/useProjectWorktrees";
import { useProjects } from "@/composables/useProjects";
import { useSessionLruPool } from "@/composables/useSessionLruPool";
import {
  newChatNavItem,
  useWorkbenchPrimaryNavigation,
} from "@/composables/useWorkbenchPrimaryNavigation";
import { buildSidebarProjects } from "@/lib/session-sidebar";

const DEFAULT_VISIBLE_SESSION_COUNT = 3;

const core = usePiChatCore();
const lru = useSessionLruPool();
const navigation = useWorkbenchPrimaryNavigation();

const editingSessionId = ref("");
const editingTitle = ref("");
const expandedGroupKeys = ref<string[]>([]);
const expandedParentIds = ref<string[]>([]);

const collapsedProjects = useLocalStorage<Record<string, boolean>>(
  "ridge.sidebar.projectCollapse",
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

const normalizePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "");

const activeSessionId = computed(() => lru.activeSessionId.value ?? "");
const topPrimaryNavItems = computed(() =>
  navigation.primaryNavItems.filter((item) => item.route !== "settings"),
);
const settingsNavItem = computed(
  () => navigation.primaryNavItems.find((item) => item.route === "settings")!,
);
const isSending = computed(
  () =>
    lru.activeSessionId.value !== null &&
    core.sessions.value.find((session) => session.id === lru.activeSessionId.value)
      ?.status === "streaming",
);

const sidebarProjects = computed(() =>
  buildSidebarProjects({
    sessions: core.sessions.value,
    sessionContexts: core.sessionContexts.value,
    storedProjects: storedProjects.value,
    availableWorktreesByProject: worktreeState.worktreesByProject.value,
    workspaceDir: core.info.value?.workspaceDir,
    workspaceChat:
      core.info.value?.chatProjectPath && core.info.value?.chatProjectId
        ? {
            id: core.info.value.chatProjectId,
            path: core.info.value.chatProjectPath,
            label: core.info.value.chatProjectLabel,
          }
        : undefined,
  }),
);
const workspaceChatProject = computed(() => sidebarProjects.value.workspaceChatProject);
const projects = computed(() => sidebarProjects.value.projects);

const isProjectCollapsed = (projectId: string) =>
  collapsedProjects.value[projectId] === true;

const isGroupExpanded = (groupKey: string) =>
  expandedGroupKeys.value.includes(groupKey);

const getVisibleCount = (total: number, groupKey: string) => {
  if (isGroupExpanded(groupKey)) {
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

const toggleProject = (projectId: string) => {
  collapsedProjects.value = {
    ...collapsedProjects.value,
    [projectId]: !collapsedProjects.value[projectId],
  };
};

const toggleParentExpand = (sessionId: string) => {
  if (expandedParentIds.value.includes(sessionId)) {
    expandedParentIds.value = expandedParentIds.value.filter((id) => id !== sessionId);
    return;
  }

  expandedParentIds.value = [...expandedParentIds.value, sessionId];
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
  void core.renameSessionTitle(sessionId, nextTitle);
};

const removeSession = (sessionId: string) => {
  if (!window.confirm("确定删除该会话？")) {
    return;
  }

  void (async () => {
    const response = await core.removeSessionTree(sessionId);
    response.sessionIds.forEach((id) => lru.removeSession(id));
  })();
};

const updateEditingTitle = (value: string) => {
  editingTitle.value = value;
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

const openWorktreeDialog = (projectId: string, projectRoot: string) => {
  worktreeDialogProjectId.value = projectId;
  worktreeDialogProjectRoot.value = projectRoot;
  isWorktreeDialogOpen.value = true;
};

const handleWorktreeCreated = async (worktreePath: string) => {
  isWorktreeDialogOpen.value = false;
  if (worktreeDialogProjectId.value) {
    await worktreeState.refresh(worktreeDialogProjectId.value);
  }

  await navigation.createChat({ cwd: worktreePath });
};

const handleDeleteWorktree = (projectId: string, worktreeRoot: string) => {
  deleteWorktreeProjectId.value = projectId;
  deleteWorktreeRoot.value = worktreeRoot;
  isDeleteWorktreeDialogOpen.value = true;
};

const handleWorktreeDeleted = async () => {
  await worktreeState.refresh(deleteWorktreeProjectId.value);
};

const findStoredProjectId = (projectRoot: string): string | null => {
  const normalized = normalizePath(projectRoot);
  const stored = storedProjects.value.find(
    (project) => normalizePath(project.path) === normalized,
  );

  return stored?.id ?? null;
};

watch(
  () => core.sessions.value,
  () => {
    if (
      editingSessionId.value &&
      !core.sessions.value.some((session) => session.id === editingSessionId.value)
    ) {
      cancelRename();
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => storedProjects.value,
  (nextProjects) => {
    if (nextProjects.length > 0) {
      void worktreeState.loadAll(nextProjects.map((project) => project.id));
    }
  },
  { immediate: true },
);

onMounted(() => {
  void loadProjects().catch(() => undefined);
});
</script>

<template>
  <SidebarProvider class="h-full min-h-0 w-full" :default-open="true">
    <Sidebar collapsible="none" class="w-full border-r bg-sidebar">
      <SidebarContent class="flex min-h-0 flex-col px-2 py-3">
        <SidebarMenu class="space-y-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              class="h-8 gap-2.5 rounded-md bg-primary/10 px-2.5 font-semibold text-sidebar-foreground hover:bg-primary/15"
              :class="{ 'ring-1 ring-primary/35': navigation.isChatRoute.value && lru.isViewingDraft.value }"
              :disabled="isSending"
              @click="navigation.createChat({})"
            >
              <component :is="newChatNavItem.icon" class="size-4" />
              <span>{{ newChatNavItem.label }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem
            v-for="item in topPrimaryNavItems"
            :key="item.route"
          >
            <SidebarMenuButton
              class="h-8 gap-2.5 rounded-md px-2.5"
              :is-active="navigation.activeRoute.value === item.route"
              @click="navigation.navigateToRoute(item.route)"
            >
              <component :is="item.icon" class="size-4" />
              <span>{{ item.label }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarGroup class="mt-3 min-h-0 flex-1">
          <SidebarGroupLabel
            v-if="workspaceChatProject"
            class="mb-1 flex items-center justify-between px-2 text-[11px] font-black uppercase tracking-[0.22em]"
            :class="navigation.isChatRoute.value ? 'text-sidebar-foreground' : 'text-sidebar-foreground/45'"
          >
            <span>{{ workspaceChatProject.label }}</span>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-6 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="新建聊天"
                  :disabled="isSending"
                  @click="navigation.createChat({ cwd: workspaceChatProject.projectRoot })"
                >
                  <Plus class="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center">
                <p>新建聊天</p>
              </TooltipContent>
            </Tooltip>
          </SidebarGroupLabel>
          <SidebarGroupContent
            v-if="workspaceChatProject"
            class="mb-3 overflow-y-auto px-1"
          >
            <div
              v-if="workspaceChatProject.groups.length === 0"
              class="mx-2 px-3 py-3"
            >
              <p class="text-[12px] text-sidebar-foreground/30">暂无聊天</p>
            </div>

            <template
              v-for="group in workspaceChatProject.groups"
              :key="group.key"
            >
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
                  :expanded-parent-ids="expandedParentIds"
                  @select="navigation.openChatSession($event)"
                  @prefetch="core.prefetchSession($event)"
                  @toggle-expand="toggleParentExpand($event)"
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
          </SidebarGroupContent>

          <SidebarGroupLabel
            class="flex items-center justify-between px-2 text-[11px] font-black uppercase tracking-[0.22em]"
            :class="navigation.isChatRoute.value ? 'text-sidebar-foreground' : 'text-sidebar-foreground/45'"
          >
            <span>项目</span>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-6 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="添加项目"
                  :disabled="isProjectLoading"
                  @click="openProjectDialog"
                >
                  <Folder class="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center">
                <p>添加项目</p>
              </TooltipContent>
            </Tooltip>
          </SidebarGroupLabel>
          <SidebarGroupContent class="min-h-0 flex-1 overflow-y-auto px-1">
            <div v-if="projects.length === 0" class="py-10 text-center">
              <p class="text-[12px] text-sidebar-foreground/30">无已添加项目</p>
            </div>

            <SidebarMenu v-else class="space-y-0.5">
                <div v-for="project in projects" :key="project.id" class="space-y-0.5">
                  <SidebarMenuItem>
                    <div class="flex items-center gap-1">
                      <SidebarMenuButton
                        as-child
                        class="min-w-0 flex-1 pl-1.5 pr-2 hover:bg-sidebar-accent/40"
                      >
                        <button
                          type="button"
                          class="flex w-full items-center gap-1.5"
                          @click="toggleProject(project.id)"
                        >
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
                              @click="navigation.createChat({ cwd: project.projectRoot })"
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
                        class="mx-2 px-3 py-3"
                      >
                        <p class="text-[12px] text-sidebar-foreground/50">暂无会话</p>
                      </div>

                      <template v-for="group in project.groups" :key="group.key">
                        <div
                          v-if="group.kind !== 'project-root'"
                          class="group/gh flex items-center justify-between py-1.5 pl-5 pr-2"
                        >
                          <span class="text-[10px] font-bold tracking-wider text-sidebar-foreground/25 uppercase">
                            {{ group.label }}
                          </span>
                          <div class="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/gh:opacity-100">
                            <template v-if="group.kind === 'worktree'">
                              <Tooltip>
                                <TooltipTrigger as-child>
                                  <button
                                    type="button"
                                    class="inline-flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                    @click="navigation.createChat({ cwd: group.worktreeRoot })"
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
                                    class="inline-flex h-5 w-5 items-center justify-center rounded text-sidebar-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                                    @click="handleDeleteWorktree(findStoredProjectId(project.projectRoot)!, group.worktreeRoot)"
                                  >
                                    <GitBranch class="size-3" />
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
                            :expanded-parent-ids="expandedParentIds"
                            @select="navigation.openChatSession($event)"
                            @prefetch="core.prefetchSession($event)"
                            @toggle-expand="toggleParentExpand($event)"
                            @start-rename="startRename"
                            @update-editing-title="updateEditingTitle"
                            @save-rename="saveRename"
                            @cancel-rename="cancelRename"
                            @remove="removeSession"
                          />
                        </div>

                        <div
                          v-if="group.kind === 'worktree' && group.tree.length === 0"
                          class="mx-2 px-3 py-2"
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

        <SidebarFooter class="mt-2 px-1 pt-2">
          <SidebarMenu class="space-y-0.5 border-t border-sidebar-border/70 pt-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                class="h-8 gap-2.5 rounded-md px-2.5"
                :is-active="navigation.activeRoute.value === 'settings'"
                @click="navigation.navigateToRoute('settings')"
              >
                <component :is="settingsNavItem.icon" class="size-4" />
                <span>设置</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </SidebarContent>
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
