<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleDot,
  Play,
  RefreshCw,
  SearchCheck,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createDeviceStorage } from "@/lib/device/device-storage";
import {
  createMobileTaskApiClient,
  type MobileProjectSummary,
  type MobileTask,
  type MobileTaskStatus,
} from "@/lib/tasks/mobile-task-api-client";
import { createMobileTaskStore } from "@/lib/tasks/mobile-task-store";

const router = useRouter();
const api = createMobileApiClient();
const deviceStorage = createDeviceStorage();
const taskApi = createMobileTaskApiClient({
  api,
  registration: () => deviceStorage.getRegistration(),
});
const store = createMobileTaskStore({ api: taskApi });

const groupDefinitions = computed(() => [
  { key: "pending" as const, label: "待办", icon: Circle, tasks: store.groups.pending },
  { key: "inProgress" as const, label: "进行中", icon: CircleDot, tasks: store.groups.inProgress },
  { key: "reviewing" as const, label: "审核中", icon: SearchCheck, tasks: store.groups.reviewing },
  { key: "completed" as const, label: "已完成", icon: CheckCircle2, tasks: store.groups.completed },
]);

const selectedTask = computed(() => store.selectedTask);

const statusText: Record<MobileTaskStatus, string> = {
  pending: "待办",
  in_progress: "进行中",
  blocked: "阻塞",
  reviewing: "审核中",
  completed: "已完成",
};

const priorityText: Record<MobileTask["priority"], string> = {
  normal: "普通",
  important: "重要",
  urgent: "紧急",
};

const nextStatusOptions: Record<MobileTaskStatus, MobileTaskStatus[]> = {
  pending: ["in_progress"],
  in_progress: ["blocked", "reviewing"],
  blocked: ["in_progress"],
  reviewing: ["completed"],
  completed: [],
};

function projectTitle(project: MobileProjectSummary) {
  if (project.name) return project.name;
  if (project.label) return project.label;
  if (project.path) return project.path.split(/[\\/]/).filter(Boolean).at(-1) ?? project.path;
  return project.id;
}

function projectFor(task: MobileTask) {
  return task.projectId ? store.projects.find((project) => project.id === task.projectId) ?? null : null;
}

function taskProjectText(task: MobileTask) {
  const project = projectFor(task);
  if (!task.projectId) return "默认工作空间";
  return project ? projectTitle(project) : task.projectId;
}

async function updateStatus(status: MobileTaskStatus) {
  const task = selectedTask.value;
  if (!task) return;
  await store.updateStatus(task.id, status);
}

async function openProcessingSession() {
  const task = selectedTask.value;
  if (!task) return;
  const result = await store.openProcessingSession(task.id);
  if (!result.success) return;
  await router.push({
    name: "chat",
    query: { sessionId: result.sessionId },
  });
}

onMounted(() => {
  void store.load();
});
</script>

<template>
  <main class="mobile-screen tasks-screen" aria-labelledby="tasks-title" data-testid="tasks-screen">
    <div class="tasks-title-row">
      <div>
        <p class="eyebrow">任务轻操作</p>
        <h1 id="tasks-title">
          跟进任务
        </h1>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="刷新任务"
        data-testid="tasks-refresh"
        @click="store.load"
      >
        <RefreshCw class="size-4" aria-hidden="true" />
      </Button>
    </div>

    <p v-if="store.error" class="settings-error" role="alert">
      {{ store.error }}
    </p>

    <section class="task-groups" aria-label="任务状态分组">
      <article
        v-for="group in groupDefinitions"
        :key="group.key"
        class="task-group-panel"
      >
        <header>
          <span>
            <component :is="group.icon" class="size-4" aria-hidden="true" />
            {{ group.label }}
          </span>
          <strong>{{ group.tasks.length }}</strong>
        </header>
        <div class="task-card-list">
          <button
            v-for="task in group.tasks"
            :key="task.id"
            type="button"
            class="mobile-task-card"
            :class="{ active: task.id === store.selectedTaskId }"
            :data-testid="`mobile-task-card-${task.id}`"
            @click="store.selectTask(task.id)"
          >
            <span class="task-card-title">{{ task.title }}</span>
            <span class="task-card-meta">
              {{ statusText[task.status] }} · {{ priorityText[task.priority] }} · {{ taskProjectText(task) }}
            </span>
          </button>
          <p v-if="!group.tasks.length" class="chat-empty-line">
            暂无任务
          </p>
        </div>
      </article>
    </section>

    <section v-if="selectedTask" class="task-detail" aria-label="任务详情">
      <div class="task-detail-heading">
        <div>
          <p class="eyebrow">详情</p>
          <h2>{{ selectedTask.title }}</h2>
        </div>
        <span class="task-status-badge">{{ statusText[selectedTask.status] }}</span>
      </div>

      <dl class="task-detail-grid">
        <div>
          <dt>项目</dt>
          <dd>{{ taskProjectText(selectedTask) }}</dd>
        </div>
        <div>
          <dt>处理会话</dt>
          <dd>{{ selectedTask.processingSessionId ? "已创建" : "未创建" }}</dd>
        </div>
        <div>
          <dt>优先级</dt>
          <dd>{{ priorityText[selectedTask.priority] }}</dd>
        </div>
      </dl>

      <p class="task-acceptance">
        {{ selectedTask.acceptanceCriteria }}
      </p>
      <p v-if="selectedTask.blockedReason" class="task-blocked-reason">
        <AlertCircle class="size-4" aria-hidden="true" />
        {{ selectedTask.blockedReason }}
      </p>

      <div v-if="nextStatusOptions[selectedTask.status].length" class="task-status-actions" aria-label="任务状态操作">
        <Button
          v-for="status in nextStatusOptions[selectedTask.status]"
          :key="status"
          type="button"
          variant="outline"
          size="sm"
          :data-testid="`task-status-${status}`"
          :disabled="store.isUpdating"
          @click="updateStatus(status)"
        >
          {{ statusText[status] }}
        </Button>
      </div>

      <Button
        type="button"
        class="task-processing-button"
        data-testid="task-processing-session"
        :disabled="selectedTask.status === 'completed'"
        @click="openProcessingSession"
      >
        <Play class="size-4" aria-hidden="true" />
        {{ selectedTask.processingSessionId ? "继续处理" : "开始处理" }}
      </Button>
    </section>
  </main>
</template>
