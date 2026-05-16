import { describe, expect, it, vi } from "vitest";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import type { MobileDeviceRegistration } from "@/lib/device/device-storage";
import {
  createMobileTaskApiClient,
} from "@/lib/tasks/mobile-task-api-client";

function createRegistration(): MobileDeviceRegistration {
  return {
    deviceId: "android-task-api",
    token: "rdt_task_api",
    name: "Pixel",
  };
}

describe("mobile task API client", () => {
  it("uses Android token for task list, project list, status update, and processing session", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/api/workspace/tasks") && init?.method === "GET") {
        return new Response(
          JSON.stringify({
            tasks: [
              {
                id: "task-1",
                title: "查任务",
                status: "pending",
                priority: "normal",
                projectId: "project-1",
                acceptanceCriteria: "能读取",
                processingSessionId: null,
                createdAt: 1,
                updatedAt: 1,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (String(url).endsWith("/api/workspace/projects")) {
        return new Response(
          JSON.stringify({
            projects: [{ id: "project-1", name: "ridge", path: "/repo", isOnline: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (String(url).endsWith("/processing-session")) {
        return new Response(JSON.stringify({ sessionId: "session-task", created: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          task: {
            id: "task-1",
            title: "查任务",
            status: "in_progress",
            priority: "normal",
            projectId: "project-1",
            acceptanceCriteria: "能读取",
            processingSessionId: null,
            createdAt: 1,
            updatedAt: 2,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const api = createMobileApiClient({
      storage: window.localStorage,
      fetcher: fetcher as typeof fetch,
    });
    api.setServiceBaseUrl("https://ridge.example.com");
    const client = createMobileTaskApiClient({
      api,
      registration: createRegistration,
    });

    await client.listTasks();
    await client.listProjects();
    await client.updateTaskStatus("task-1", "in_progress");
    await client.openProcessingSession("task-1");

    expect(calls.map((call) => call.url)).toEqual([
      "https://ridge.example.com/api/workspace/tasks",
      "https://ridge.example.com/api/workspace/projects",
      "https://ridge.example.com/api/workspace/tasks/task-1",
      "https://ridge.example.com/api/workspace/tasks/task-1/processing-session",
    ]);
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({
      status: "in_progress",
      actor: "user",
    });
    for (const call of calls) {
      expect(new Headers(call.init.headers).get("Authorization")).toBe("Bearer rdt_task_api");
    }
  });
});
