import { describe, expect, it, vi } from "vitest";
import {
  createMobileTaskStore,
  type MobileTaskApiClient,
} from "@/lib/tasks/mobile-task-store";
import type { MobileTask } from "@/lib/tasks/mobile-task-api-client";

function createTask(overrides: Partial<MobileTask> = {}): MobileTask {
  return { ...baseTask(), ...overrides };
}

function baseTask(): MobileTask {
  return {
    id: "task-1",
    title: "任务",
    status: "pending" as const,
    priority: "normal" as const,
    projectId: null,
    acceptanceCriteria: "完成标准",
    dueDate: null,
    blockedReason: null,
    processingSessionId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("mobile task store", () => {
  it("groups tasks from server status without rewriting task status", async () => {
    const api: MobileTaskApiClient = {
      listTasks: vi.fn(async () => ({
        tasks: [
          createTask({ id: "task-pending", status: "pending" }),
          createTask({ id: "task-running", status: "in_progress" }),
          createTask({ id: "task-blocked", status: "blocked" }),
          createTask({ id: "task-review", status: "reviewing" }),
          createTask({ id: "task-done", status: "completed" }),
        ],
      })),
      listProjects: vi.fn(async () => ({ projects: [] })),
      updateTaskStatus: vi.fn(),
      openProcessingSession: vi.fn(),
    };
    const store = createMobileTaskStore({ api });

    await store.load();

    expect(store.groups.pending.map((task) => task.id)).toEqual(["task-pending"]);
    expect(store.groups.inProgress.map((task) => task.id)).toEqual(["task-running", "task-blocked"]);
    expect(store.groups.reviewing.map((task) => task.id)).toEqual(["task-review"]);
    expect(store.groups.completed.map((task) => task.id)).toEqual(["task-done"]);
    expect(store.tasks.find((task) => task.id === "task-blocked")?.status).toBe("blocked");
  });

  it("rolls back optimistic status when server rejects transition", async () => {
    const api: MobileTaskApiClient = {
      listTasks: vi.fn(async () => ({ tasks: [createTask({ id: "task-1", status: "pending" })] })),
      listProjects: vi.fn(async () => ({ projects: [] })),
      updateTaskStatus: vi.fn(async () => {
        throw new Error("非法状态流转");
      }),
      openProcessingSession: vi.fn(),
    };
    const store = createMobileTaskStore({ api });
    await store.load();

    const result = await store.updateStatus("task-1", "completed");

    expect(result).toEqual({ success: false, error: "非法状态流转" });
    expect(store.tasks[0]?.status).toBe("pending");
    expect(store.error).toBe("非法状态流转");
  });

  it("updates task processing session after opening it", async () => {
    const api: MobileTaskApiClient = {
      listTasks: vi.fn(async () => ({ tasks: [createTask({ id: "task-1" })] })),
      listProjects: vi.fn(async () => ({ projects: [] })),
      updateTaskStatus: vi.fn(),
      openProcessingSession: vi.fn(async () => ({ sessionId: "session-task", created: true })),
    };
    const store = createMobileTaskStore({ api });
    await store.load();

    const result = await store.openProcessingSession("task-1");

    expect(result).toEqual({ success: true, sessionId: "session-task" });
    expect(store.tasks[0]?.processingSessionId).toBe("session-task");
  });
});
