import type { MobileApiClient } from "@/lib/api/mobile-api-client";
import type { MobileDeviceRegistration } from "@/lib/device/device-storage";
import type { MobileMediaDraftAttachment } from "@/lib/media/media-draft-storage";
import type { MobileRawChatMessage, MobileChatStatus } from "@/lib/chat/mobile-chat-sse";

export interface MobileChatSessionSummary {
  id: string;
  title: string;
  status?: MobileChatStatus;
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
}

export interface MobileChatMessagesPayload {
  messages: MobileRawChatMessage[];
  interactiveRequests?: unknown[];
  permissionRequests?: unknown[];
}

export interface MobileChatAttachmentUploadResponse {
  attachments: Array<{ id: string }>;
}

export interface MobileChatApiClient {
  listSessions(): Promise<MobileChatSessionSummary[]>;
  createSession(): Promise<MobileChatSessionSummary>;
  getMessages(sessionId: string): Promise<MobileChatMessagesPayload>;
  uploadAttachments(
    sessionId: string,
    attachments: MobileMediaDraftAttachment[],
  ): Promise<MobileChatAttachmentUploadResponse>;
  sendMessage(
    sessionId: string,
    payload: { prompt: string; attachmentIds?: string[] },
  ): Promise<{ ok: true }>;
  cancelSession(sessionId: string): Promise<{ ok: true }>;
}

export interface MobileChatApiClientOptions {
  api: MobileApiClient;
  registration: () => MobileDeviceRegistration | null;
  fetcher?: typeof fetch;
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

function arrayBufferFromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

export function mobileAttachmentToFile(
  attachment: MobileMediaDraftAttachment,
): File {
  return new File([arrayBufferFromBase64(attachment.base64)], attachment.name, {
    type: attachment.mimeType,
  });
}

export function createMobileChatApiClient(
  options: MobileChatApiClientOptions,
): MobileChatApiClient {
  const fetcher = options.fetcher ?? fetch;
  const buildUrl = (path: string) => {
    const baseUrl = options.api.requireServiceBaseUrl();
    return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  };
  const withAuth = () => authHeaders(requireRegistration(options.registration()));

  return {
    async listSessions() {
      const response = await options.api.get("/api/sessions", {
        headers: withAuth(),
      });
      return readJson<MobileChatSessionSummary[]>(response);
    },

    async createSession() {
      const response = await options.api.post(
        "/api/sessions",
        { title: "移动端会话" },
        { headers: withAuth() },
      );
      return readJson<MobileChatSessionSummary>(response);
    },

    async getMessages(sessionId) {
      const response = await options.api.get(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
        { headers: withAuth() },
      );
      return readJson<MobileChatMessagesPayload>(response);
    },

    async uploadAttachments(sessionId, attachments) {
      const formData = new FormData();
      for (const attachment of attachments) {
        formData.append("files", mobileAttachmentToFile(attachment), attachment.name);
      }
      const response = await fetcher(
        buildUrl(`/api/sessions/${encodeURIComponent(sessionId)}/attachments`),
        {
          method: "POST",
          headers: withAuth(),
          body: formData,
        },
      );
      return readJson<MobileChatAttachmentUploadResponse>(response);
    },

    async sendMessage(sessionId, payload) {
      const body =
        payload.attachmentIds && payload.attachmentIds.length > 0
          ? {
              prompt: payload.prompt,
              attachmentIds: payload.attachmentIds,
            }
          : { prompt: payload.prompt };
      const response = await options.api.post(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
        body,
        { headers: withAuth() },
      );
      return readJson<{ ok: true }>(response);
    },

    async cancelSession(sessionId) {
      const response = await options.api.post(
        `/api/sessions/${encodeURIComponent(sessionId)}/cancel`,
        {},
        { headers: withAuth() },
      );
      return readJson<{ ok: true }>(response);
    },
  };
}
