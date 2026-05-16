import { describe, expect, it, vi } from "vitest";
import {
  createMobileChatDraftStorage,
} from "@/lib/chat/mobile-chat-draft-storage";
import {
  createMobileChatStore,
  type MobileChatApi,
} from "@/lib/chat/mobile-chat-store";
import type { MobileMediaDraftAttachment } from "@/lib/media/media-draft-storage";

function createAttachment(): MobileMediaDraftAttachment {
  return {
    id: "local-audio",
    kind: "audio",
    source: "recorder",
    uri: "memory://recording.webm",
    name: "recording.webm",
    mimeType: "audio/webm",
    size: 5,
    base64: btoa("audio"),
  };
}

function createApi(overrides: Partial<MobileChatApi> = {}): MobileChatApi {
  return {
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => ({
      id: "s1",
      title: "移动对话",
      status: "idle" as const,
      createdAt: 1,
      updatedAt: 1,
      archived: false,
    })),
    getMessages: vi.fn(async () => ({
      messages: [],
      interactiveRequests: [],
      permissionRequests: [],
    })),
    uploadAttachments: vi.fn(async () => ({ attachments: [{ id: "server-att" }] })),
    sendMessage: vi.fn(async () => ({ ok: true as const })),
    cancelSession: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe("mobile chat store", () => {
  it("keeps text and attachments when sending fails", async () => {
    const api = createApi({
      sendMessage: vi.fn(async () => {
        throw new Error("send failed");
      }),
    });
    const draftStorage = createMobileChatDraftStorage(window.localStorage);
    const store = createMobileChatStore({ api, draftStorage });
    store.composer.text = "带附件的问题";
    store.composer.attachments = [createAttachment()];

    await store.send();

    expect(store.error).toBe("send failed");
    expect(store.composer.text).toBe("带附件的问题");
    expect(store.composer.attachments).toHaveLength(1);
    expect(draftStorage.loadDraft()).toMatchObject({
      text: "带附件的问题",
      attachments: [{ id: "local-audio" }],
    });
  });

  it("clears the pending draft only after the final assistant message arrives", async () => {
    const draftStorage = createMobileChatDraftStorage(window.localStorage);
    const store = createMobileChatStore({ api: createApi(), draftStorage });
    store.composer.text = "生成总结";

    await store.send();

    expect(store.composer.text).toBe("");
    expect(draftStorage.loadDraft()?.text).toBe("生成总结");

    store.applyStreamEvent({
      type: "message_end",
      message: { role: "assistant", content: "总结完成", timestamp: 2 },
    });

    expect(store.isSending).toBe(false);
    expect(draftStorage.loadDraft()).toBeNull();
  });
});
