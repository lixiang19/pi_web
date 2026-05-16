import { reactive } from "vue";
import type {
  MobileProjectSummary,
  MobileTask,
  MobileTaskApiClient as ApiClient,
  MobileTaskStatus,
} from "@/lib/tasks/mobile-task-api-client";

export type MobileTaskApiClient = ApiClient;

export interface MobileTaskGroups {
  pending: MobileTask[];
  inProgress: MobileTask[];
  reviewing: MobileTask[];
  completed: MobileTask[];
}

export interface MobileTaskStore {
  tasks: MobileTask[];
  projects: MobileProjectSummary[];
  selectedTaskId: string | null;
  selectedTask: MobileTask | null;
  groups: MobileTaskGroups;
  isLoading: boolean;
  isUpdating: boolean;
  error: string;
  load(): Promise<void>;
  selectTask(taskId: string): void;
  updateStatus(taskId: string, status: MobileTaskStatus): Promise<
    | { success: true; task: MobileTask }
    | { success: false; error: string }
  >;
  openProcessingSession(taskId: string): Promise<
    | { success: true; sessionId: string }
    | { success: false; error: string }
  >;
}

export interface MobileTaskStoreOptions {
  api: MobileTaskApiClient;
}

const activeStatuses = new Set<MobileTaskStatus>(["in_progress", "blocked"]);

function emptyGroups(): MobileTaskGroups {
  return {
    pending: [],
    inProgress: [],
    reviewing: [],
    completed: [],
  };
}

function groupTasks(tasks: MobileTask[]): MobileTaskGroups {
  return {
    pending: tasks.filter((task) => task.status === "pending"),
    inProgress: tasks.filter((task) => activeStatuses.has(task.status)),
    reviewing: tasks.filter((task) => task.status === "reviewing"),
    completed: tasks.filter((task) => task.status === "completed"),
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createMobileTaskStore(options: MobileTaskStoreOptions): MobileTaskStore {
  const store = reactive({
    tasks: [] as MobileTask[],
    projects: [] as MobileProjectSummary[],
    selectedTaskId: null as string | null,
    selectedTask: null as MobileTask | null,
    groups: emptyGroups(),
    isLoading: false,
    isUpdating: false,
    error: "",

    async load() {
      store.isLoading = true;
      store.error = "";
      try {
        const [tasksResponse, projectsResponse] = await Promise.all([
          options.api.listTasks(),
          options.api.listProjects(),
        ]);
        store.tasks = tasksResponse.tasks;
        store.projects = projectsResponse.projects;
        if (!store.selectedTaskId || !store.tasks.some((task) => task.id === store.selectedTaskId)) {
          store.selectedTaskId = store.tasks[0]?.id ?? null;
        }
        syncDerived();
      } catch (error) {
        store.error = toErrorMessage(error);
      } finally {
        store.isLoading = false;
      }
    },

    selectTask(taskId: string) {
      store.selectedTaskId = taskId;
      syncDerived();
    },

    async updateStatus(taskId: string, status: MobileTaskStatus) {
      const target = store.tasks.find((task) => task.id === taskId);
      if (!target) {
        return { success: false as const, error: "任务不存在" };
      }
      const previous = { ...target };
      store.isUpdating = true;
      store.error = "";
      Object.assign(target, { status, updatedAt: Date.now() });
      syncDerived();
      try {
        const response = await options.api.updateTaskStatus(taskId, status);
        Object.assign(target, response.task);
        syncDerived();
        return { success: true as const, task: response.task };
      } catch (error) {
        Object.assign(target, previous);
        syncDerived();
        const message = toErrorMessage(error);
        store.error = message;
        return { success: false as const, error: message };
      } finally {
        store.isUpdating = false;
      }
    },

    async openProcessingSession(taskId: string) {
      store.error = "";
      try {
        const response = await options.api.openProcessingSession(taskId);
        const target = store.tasks.find((task) => task.id === taskId);
        if (target) {
          target.processingSessionId = response.sessionId;
          syncDerived();
        }
        return { success: true as const, sessionId: response.sessionId };
      } catch (error) {
        const message = toErrorMessage(error);
        store.error = message;
        return { success: false as const, error: message };
      }
    },
  }) as MobileTaskStore;

  function syncDerived() {
    store.groups = groupTasks(store.tasks);
    store.selectedTask =
      store.tasks.find((task) => task.id === store.selectedTaskId) ?? store.tasks[0] ?? null;
  }

  return store;
}
