import { describe, expect, it, vi } from "vitest";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import type { MobileDeviceRegistration } from "@/lib/device/device-storage";
import {
  createMobileChatApiClient,
  mobileAttachmentToFile,
} from "@/lib/chat/mobile-chat-api-client";
import type { MobileMediaDraftAttachment } from "@/lib/media/media-draft-storage";

function createRegistration(): MobileDeviceRegistration {
  return {
    deviceId: "android-chat-api",
    token: "rdt_chat_api",
    name: "Pixel",
  };
}

function createAttachment(): MobileMediaDraftAttachment {
  return {
    id: "att-local",
    kind: "photo",
    source: "gallery",
    uri: "memory://photo.png",
    name: "photo.png",
    mimeType: "image/png",
    size: 5,
    base64: btoa("photo"),
  };
}

describe("mobile chat API client", () => {
  it("uses Android token on session, message, attachment, and cancel requests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/attachments")) {
        return new Response(JSON.stringify({ attachments: [{ id: "server-att-1" }] }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (String(url).endsWith("/sessions")) {
        return new Response(JSON.stringify([{ id: "s1", title: "Chat" }]), {
          status: init?.method === "POST" ? 201 : 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, messages: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const api = createMobileApiClient({
      storage: window.localStorage,
      fetcher: fetcher as typeof fetch,
    });
    api.setServiceBaseUrl("https://ridge.example.com");
    const client = createMobileChatApiClient({
      api,
      registration: createRegistration,
      fetcher: fetcher as typeof fetch,
    });

    await client.listSessions();
    await client.createSession();
    await client.getMessages("s1");
    await client.uploadAttachments("s1", [createAttachment()]);
    await client.sendMessage("s1", { prompt: "hello", attachmentIds: ["server-att-1"] });
    await client.cancelSession("s1");

    expect(calls.map((call) => call.url)).toEqual([
      "https://ridge.example.com/api/sessions",
      "https://ridge.example.com/api/sessions",
      "https://ridge.example.com/api/sessions/s1/messages",
      "https://ridge.example.com/api/sessions/s1/attachments",
      "https://ridge.example.com/api/sessions/s1/messages",
      "https://ridge.example.com/api/sessions/s1/cancel",
    ]);
    for (const call of calls) {
      expect(new Headers(call.init.headers).get("Authorization")).toBe("Bearer rdt_chat_api");
    }
    expect(calls[3]!.init.body).toBeInstanceOf(FormData);
    expect(new Headers(calls[3]!.init.headers).has("Content-Type")).toBe(false);
  });

  it("turns mobile base64 attachments back into uploadable Files", async () => {
    const file = mobileAttachmentToFile(createAttachment());

    expect(file.name).toBe("photo.png");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("photo");
  });
});
