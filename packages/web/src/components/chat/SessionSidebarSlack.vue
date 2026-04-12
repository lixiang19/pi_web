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
  MoreHorizontal,
  Pin,
} from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import ProjectSelectorDialog from "@/components/chat/ProjectSelectorDialog.vue";
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

const collapsedSections = useLocalStorage<Record<string, boolean>>(
  "pi.sidebar.collapsed",
  { recent: false, projects: false }
);

const pinnedSessionIds = useLocalStorage<string[]>("pi.sessions.pinned", []);
const recentSessionIds = useLocalStorage<string[]>("pi.sessions.recent", []);

// Projects
const projectState = useProjects();
const {
  add: addProjectToList,
  error: projectError,
  isLoading: isProjectLoading,
  load: loadProjects,
  projects: storedProjects,
} = projectState;

const isProjectDialogOpen = ref(false);
const contextMenuSession = ref<string | null>(null);

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());

const projects = computed(() =>
  buildSessionProjects({
    sessions: props.sessions,
    storedProjects: storedProjects.value,
    query: normalizedQuery.value,
    ...(props.workspaceDir ? { workspaceDir: props.workspaceDir } : {}),
  })
);

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

const isSectionCollapsed = (sectionId: string) =>
  collapsedSections.value[sectionId] === true;

const toggleSection = (sectionId: string) => {
  collapsedSections.value = {
    ...collapsedSections.value,
    [sectionId]: !collapsedSections.value[sectionId],
  };
};

const handleSelect = (sessionId: string) => {
  const current = new Set(recentSessionIds.value);
  current.delete(sessionId);
  recentSessionIds.value = [sessionId, ...current].slice(0, MAX_RECENT_SESSIONS);
  emit("select", sessionId);
};

const isPinned = (sessionId: string) =>
  pinnedSessionIds.value.includes(sessionId);

const togglePin = (sessionId: string) => {
  const next = new Set(pinnedSessionIds.value);
  if (next.has(sessionId)) {
    next.delete(sessionId);
  } else {
    next.add(sessionId);
  }
  pinnedSessionIds.value = [...next];
};

const removeSession = (sessionId: string) => {
  if (!window.confirm("确定删除该会话？")) return;
  emit("remove", sessionId);
};

const openProjectDialog = () => {
  isProjectDialogOpen.value = true;
};

const handleAddProject = async (projectPath: string) => {
  const project = await addProjectToList(projectPath);
  if (!project) return;
  isProjectDialogOpen.value = false;
};

// Cleanup
watch(
  () => props.sessions,
  (sessions) => {
    const sessionIds = new Set(sessions.map((s) => s.id));
    pinnedSessionIds.value = pinnedSessionIds.value.filter((id) =>
      sessionIds.has(id)
    );
    recentSessionIds.value = recentSessionIds.value.filter((id) => {
      const s = sessions.find((s) => s.id === id);
      return s && !s.archived;
    });
  },
  { immediate: true, deep: true }
);

onMounted(() => {
  void loadProjects().catch(() => undefined);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-[#f5f5f5] dark:bg-[#1a1d21] text-[#333] dark:text-[#e0e0e0]">
    <!-- Header -->
    <div class="shrink-0 px-4 pt-4 pb-3">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="flex h-6 w-6 items-center justify-center rounded bg-[#4c6ef5]">
            <span class="text-xs font-bold text-white">R</span>
          </div>
          <span class="text-sm font-semibold">ridge</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="p-1.5 rounded hover:bg-[#e0e0e0] dark:hover:bg-[#2a2a2a] text-[#888] dark:text-[#a0a0a0] hover:text-[#333] dark:hover:text-[#e0e0e0] transition-colors"
            title="添加项目"
            :disabled="isProjectLoading"
            @click="openProjectDialog"
          >
            <Folder class="size-4" />
          </button>
          <button
            class="p-1.5 rounded hover:bg-[#e0e0e0] dark:hover:bg-[#2a2a2a] text-[#888] dark:text-[#a0a0a0] hover:text-[#333] dark:hover:text-[#e0e0e0] transition-colors"
            title="新建会话"
            :disabled="isSending"
            @click="emit('create', {})"
          >
            <Plus class="size-4" />
          </button>
        </div>
      </div>

      <div class="relative">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999] dark:text-[#666]" />
        <Input
          v-model="searchQuery"
          placeholder="搜索会话..."
          class="h-8 border-0 bg-white dark:bg-[#2a2a2a] text-[13px] pl-9 text-[#333] dark:text-[#e0e0e0] placeholder:text-[#999] dark:placeholder:text-[#666] focus-visible:ring-1 focus-visible:ring-[#4c6ef5] rounded shadow-sm"
        />
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-y-auto py-2">
      <!-- Recent Section -->
      <div v-if="recentSessions.length > 0 && !searchQuery" class="mb-1">
        <button
          class="w-full flex items-center justify-between px-4 py-2 text-[13px] font-semibold text-[#666] dark:text-[#a0a0a0] hover:bg-[#eaeaea] dark:hover:bg-[#252525] transition-colors"
          @click="toggleSection('recent')"
        >
          <span>最近访问</span>
          <ChevronDown
            class="size-4 transition-transform"
            :class="{ '-rotate-90': isSectionCollapsed('recent') }"
          />
        </button>

        <div v-if="!isSectionCollapsed('recent')" class="space-y-0.5 px-2">
          <div
            v-for="session in recentSessions"
            :key="session.id"
            class="group relative flex items-center rounded-md overflow-hidden"
            :class="[
              activeSessionId === session.id
                ? 'bg-[#e0e0e0] dark:bg-[#2d2d2d]'
                : 'hover:bg-[#eaeaea] dark:hover:bg-[#252525]'
            ]"
          >
            <!-- Active Indicator -->
            <div
              v-if="activeSessionId === session.id"
              class="absolute left-0 top-0 bottom-0 w-1 bg-[#4c6ef5]"
            />

            <button
              class="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0"
              @click="handleSelect(session.id)"
            >
              <span class="truncate text-[13px]" :class="[
                activeSessionId === session.id ? 'text-[#111] dark:text-white font-medium' : 'text-[#555] dark:text-[#b0b0b0]'
              ]">
                {{ session.title || '无标题' }}
              </span>
              <Pin v-if="isPinned(session.id)" class="size-3 shrink-0 text-[#4c6ef5]" />
            </button>

            <!-- Context Menu Trigger -->
            <button
              class="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded text-[#999] dark:text-[#666] hover:text-[#333] dark:hover:text-[#e0e0e0] hover:bg-[#d0d0d0] dark:hover:bg-[#3a3a3a] transition-all"
              @click.stop="contextMenuSession = contextMenuSession === session.id ? null : session.id"
            >
              <MoreHorizontal class="size-4" />
            </button>

            <!-- Simple Context Menu -->
            <div
              v-if="contextMenuSession === session.id"
              class="absolute right-2 top-full z-10 mt-1 w-32 rounded-md bg-white dark:bg-[#2a2a2a] border border-[#ddd] dark:border-[#3a3a3a] shadow-lg py-1"
            >
              <button
                class="w-full px-3 py-1.5 text-left text-[12px] text-[#333] dark:text-[#e0e0e0] hover:bg-[#f0f0f0] dark:hover:bg-[#3a3a3a] transition-colors"
                @click="togglePin(session.id); contextMenuSession = null"
              >
                {{ isPinned(session.id) ? '取消固定' : '固定' }}
              </button>
              <button
                class="w-full px-3 py-1.5 text-left text-[12px] text-red-500 dark:text-red-400 hover:bg-[#f0f0f0] dark:hover:bg-[#3a3a3a] transition-colors"
                @click="removeSession(session.id); contextMenuSession = null"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Projects Section -->
      <div class="mb-1">
        <button
          class="w-full flex items-center justify-between px-4 py-2 text-[13px] font-semibold text-[#666] dark:text-[#a0a0a0] hover:bg-[#eaeaea] dark:hover:bg-[#252525] transition-colors"
          @click="toggleSection('projects')"
        >
          <span>{{ searchQuery ? '搜索结果' : '浏览项目' }}</span>
          <ChevronDown
            class="size-4 transition-transform"
            :class="{ '-rotate-90': isSectionCollapsed('projects') }"
          />
        </button>

        <div v-if="!isSectionCollapsed('projects')" class="space-y-4 px-2">
          <div v-if="projects.length === 0" class="py-8 text-center">
            <p class="text-[12px] text-[#999] dark:text-[#666]">无会话记录</p>
          </div>

          <div v-for="project in projects" :key="project.id" class="space-y-0.5">
            <!-- Project Header -->
            <button
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#eaeaea] dark:hover:bg-[#252525] transition-colors"
              @click="toggleSection(`project-${project.id}`)"
            >
              <component
                :is="isSectionCollapsed(`project-${project.id}`) ? ChevronRight : ChevronDown"
                class="size-4 text-[#999] dark:text-[#666]"
              />
              <span class="truncate text-[13px] font-medium text-[#555] dark:text-[#c0c0c0]">
                {{ project.label }}
              </span>
            </button>

            <!-- Project Sessions -->
            <div v-if="!isSectionCollapsed(`project-${project.id}`)" class="space-y-0.5 ml-4">
              <template v-for="group in project.groups" :key="group.key">
                <div
                  v-if="group.kind !== 'project-root'"
                  class="px-2 py-1 text-[11px] font-semibold text-[#999] dark:text-[#666] uppercase tracking-wide"
                >
                  {{ group.label }}
                </div>

                <div
                  v-for="node in group.tree"
                  :key="node.session.id"
                  class="group relative flex items-center rounded-md overflow-hidden"
                  :class="[
                    activeSessionId === node.session.id
                      ? 'bg-[#e0e0e0] dark:bg-[#2d2d2d]'
                      : 'hover:bg-[#eaeaea] dark:hover:bg-[#252525]'
                  ]"
                >
                  <!-- Active Indicator -->
                  <div
                    v-if="activeSessionId === node.session.id"
                    class="absolute left-0 top-0 bottom-0 w-1 bg-[#4c6ef5]"
                  />

                  <button
                    class="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0"
                    @mouseenter="emit('prefetch', node.session.id)"
                    @click="handleSelect(node.session.id)"
                  >
                    <span class="truncate text-[13px]" :class="[
                      activeSessionId === node.session.id ? 'text-[#111] dark:text-white font-medium' : 'text-[#555] dark:text-[#b0b0b0]'
                    ]">
                      {{ node.session.title || '无标题' }}
                    </span>
                    <Pin v-if="isPinned(node.session.id)" class="size-3 shrink-0 text-[#4c6ef5]" />
                  </button>

                  <!-- Context Menu Trigger -->
                  <button
                    class="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded text-[#999] dark:text-[#666] hover:text-[#333] dark:hover:text-[#e0e0e0] hover:bg-[#d0d0d0] dark:hover:bg-[#3a3a3a] transition-all"
                    @click.stop="contextMenuSession = contextMenuSession === node.session.id ? null : node.session.id"
                  >
                    <MoreHorizontal class="size-4" />
                  </button>

                  <!-- Simple Context Menu -->
                  <div
                    v-if="contextMenuSession === node.session.id"
                    class="absolute right-2 top-full z-10 mt-1 w-32 rounded-md bg-white dark:bg-[#2a2a2a] border border-[#ddd] dark:border-[#3a3a3a] shadow-lg py-1"
                  >
                    <button
                      class="w-full px-3 py-1.5 text-left text-[12px] text-[#333] dark:text-[#e0e0e0] hover:bg-[#f0f0f0] dark:hover:bg-[#3a3a3a] transition-colors"
                      @click="togglePin(node.session.id); contextMenuSession = null"
                    >
                      {{ isPinned(node.session.id) ? '取消固定' : '固定' }}
                    </button>
                    <button
                      class="w-full px-3 py-1.5 text-left text-[12px] text-red-500 dark:text-red-400 hover:bg-[#f0f0f0] dark:hover:bg-[#3a3a3a] transition-colors"
                      @click="removeSession(node.session.id); contextMenuSession = null"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="shrink-0 px-4 py-3 border-t border-[#e0e0e0] dark:border-[#2a2a2a]">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] text-[#666] dark:text-[#a0a0a0] hover:bg-[#eaeaea] dark:hover:bg-[#252525] hover:text-[#333] dark:hover:text-[#e0e0e0] transition-colors"
        @click="router.push('/settings')"
      >
        <Settings class="size-4" />
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
