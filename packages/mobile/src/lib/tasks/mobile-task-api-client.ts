import type { MobileApiClient } from "@/lib/api/mobile-api-client";
import type { MobileDeviceRegistration } from "@/lib/device/device-storage";

export const MOBILE_TASK_STATUSES = [
  "pending",
  "in_progress",
  "blocked",
  "reviewing",
  "completed",
] as const;

export type MobileTaskStatus = (typeof MOBILE_TASK_STATUSES)[number];
export type MobileTaskPriority = "normal" | "important" | "urgent";

export interface MobileTask {
  id: string;
  title: string;
  status: MobileTaskStatus;
  priority: MobileTaskPriority;
  projectId: string | null;
  acceptanceCriteria: string;
  dueDate?: number | null;
  blockedReason?: string | null;
  processingSessionId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MobileProjectSummary {
  id: string;
  name?: string;
  label?: string;
  path?: string;
  projectType?: string;
  isOnline?: boolean;
  archivedAt?: number | null;
}

export interface MobileTaskListResponse {
  tasks: MobileTask[];
}

export interface MobileProjectListResponse {
  projects: MobileProjectSummary[];
}

export interface MobileTaskUpdateResponse {
  task: MobileTask;
}

export interface MobileTaskProcessingSessionResponse {
  sessionId: string;
  created: boolean;
}

export interface MobileTaskApiClient {
  listTasks(): Promise<MobileTaskListResponse>;
  listProjects(): Promise<MobileProjectListResponse>;
  updateTaskStatus(taskId: string, status: MobileTaskStatus): Promise<MobileTaskUpdateResponse>;
  openProcessingSession(taskId: string): Promise<MobileTaskProcessingSessionResponse>;
}

export interface MobileTaskApiClientOptions {
  api: MobileApiClient;
  registration: () => MobileDeviceRegistration | null;
}

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("Content-Type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json() as unknown
    : await response.text();
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>)["error"] === "string"
        ? String((body as Record<string, unknown>)["error"])
        : typeof body === "string" && body
          ? body
          : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function requireRegistration(
  registration: MobileDeviceRegistration | null,
): MobileDeviceRegistration {
  if (!registration) {
    throw new Error("请先在移动端设置中连接 ridge 服务");
  }
  return registration;
}

function authHeaders(registration: MobileDeviceRegistration): Headers {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${registration.token}`);
  return headers;
}

export function createMobileTaskApiClient(
  options: MobileTaskApiClientOptions,
): MobileTaskApiClient {
  const withAuth = () => authHeaders(requireRegistration(options.registration()));

  return {
    async listTasks() {
      const response = await options.api.get("/api/workspace/tasks", {
        headers: withAuth(),
      });
      return readJson<MobileTaskListResponse>(response);
    },

    async listProjects() {
      const response = await options.api.get("/api/workspace/projects", {
        headers: withAuth(),
      });
      return readJson<MobileProjectListResponse>(response);
    },

    async updateTaskStatus(taskId, status) {
      const response = await options.api.patch(
        `/api/workspace/tasks/${encodeURIComponent(taskId)}`,
        { status, actor: "user" },
        { headers: withAuth() },
      );
      return readJson<MobileTaskUpdateResponse>(response);
    },

    async openProcessingSession(taskId) {
      const response = await options.api.post(
        `/api/workspace/tasks/${encodeURIComponent(taskId)}/processing-session`,
        {},
        { headers: withAuth() },
      );
      return readJson<MobileTaskProcessingSessionResponse>(response);
    },
  };
}
