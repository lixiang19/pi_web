import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import TasksPage from "@/features/tasks/TasksPage.vue";
import { mobileRoutes } from "@/router/routes";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function seedMobileConnection() {
  window.localStorage.setItem("ridge.mobile.serviceBaseUrl", "https://ridge.example.com");
  window.localStorage.setItem(
    "ridge.mobile.deviceRegistration",
    JSON.stringify({
      deviceId: "android-tasks-page",
      token: "rdt_tasks_page",
      name: "Pixel",
    }),
  );
}

describe("TasksPage Android task view", () => {
  it("renders grouped tasks, opens detail, updates status, and continues processing session", async () => {
    seedMobileConnection();
    const fetcher = vi.spyOn(window, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/api/workspace/tasks") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            tasks: [
              {
                id: "task-1",
                title: "实现 Android 任务页",
                status: "pending",
                priority: "important",
                projectId: "project-1",
                acceptanceCriteria: "真机可查看和轻操作",
                processingSessionId: null,
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: "task-2",
                title: "审核移动端",
                status: "reviewing",
                priority: "normal",
                projectId: null,
                acceptanceCriteria: "进入审核",
                processingSessionId: "session-existing",
                createdAt: 2,
                updatedAt: 2,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (target.endsWith("/api/workspace/projects")) {
        return new Response(
          JSON.stringify({
            projects: [{ id: "project-1", name: "pi_web", path: "/repo/pi_web", isOnline: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (target.endsWith("/api/workspace/tasks/task-1") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            task: {
              id: "task-1",
              title: "实现 Android 任务页",
              status: "in_progress",
              priority: "important",
              projectId: "project-1",
              acceptanceCriteria: "真机可查看和轻操作",
              processingSessionId: null,
              createdAt: 1,
              updatedAt: 3,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (target.endsWith("/api/workspace/tasks/task-1/processing-session")) {
        return new Response(JSON.stringify({ sessionId: "session-task-1", created: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: mobileRoutes,
    });
    router.push("/tasks");
    await router.isReady();

    const wrapper = mount(TasksPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain("待办");
    expect(wrapper.text()).toContain("审核中");
    expect(wrapper.text()).toContain("实现 Android 任务页");
    expect(wrapper.text()).toContain("pi_web");

    await wrapper.find("[data-testid='mobile-task-card-task-1']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("真机可查看和轻操作");

    await wrapper.find("[data-testid='task-status-in_progress']").trigger("click");
    await flushPromises();
    expect(fetcher).toHaveBeenCalledWith(
      "https://ridge.example.com/api/workspace/tasks/task-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress", actor: "user" }),
      }),
    );

    await wrapper.find("[data-testid='task-processing-session']").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("chat");
    expect(router.currentRoute.value.query["sessionId"]).toBe("session-task-1");
  });
});
