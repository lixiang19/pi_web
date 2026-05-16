import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@/features/chat/ChatPage.vue";

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly url: string;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  close() {
    this.closed = true;
  }
}

afterEach(() => {
  window.localStorage.clear();
  MockEventSource.instances = [];
  vi.restoreAllMocks();
  delete (globalThis as { EventSource?: typeof EventSource }).EventSource;
});

function seedMobileConnection() {
  window.localStorage.setItem("ridge.mobile.serviceBaseUrl", "https://ridge.example.com");
  window.localStorage.setItem(
    "ridge.mobile.deviceRegistration",
    JSON.stringify({
      deviceId: "android-chat-page",
      token: "rdt_chat_page",
      name: "Pixel",
    }),
  );
}

describe("ChatPage Android light chat", () => {
  it("creates a session, sends text, renders streamed reply, and can cancel", async () => {
    seedMobileConnection();
    (globalThis as { EventSource?: typeof EventSource }).EventSource =
      MockEventSource as unknown as typeof EventSource;

    const fetcher = vi.spyOn(window, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/api/sessions") && init?.method !== "POST") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (target.endsWith("/api/sessions") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "s-chat",
            title: "移动对话",
            status: "idle",
            createdAt: 1,
            updatedAt: 1,
            archived: false,
            messages: [],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (target.endsWith("/messages") && init?.method !== "POST") {
        return new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const wrapper = mount(ChatPage);
    await flushPromises();

    await wrapper.find("[data-testid='new-chat-button']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-testid='chat-composer-textarea']").setValue("你好 ridge");
    await wrapper.find("[data-testid='send-chat-button']").trigger("click");
    await flushPromises();

    expect(fetcher).toHaveBeenCalledWith(
      "https://ridge.example.com/api/sessions/s-chat/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ prompt: "你好 ridge" }),
      }),
    );
    expect(MockEventSource.instances[0]?.url).toBe(
      "https://ridge.example.com/api/sessions/s-chat/events?rounds=3&token=rdt_chat_page",
    );

    MockEventSource.instances[0]?.emit({
      type: "message_end",
      message: { role: "assistant", content: "你好，我在。", timestamp: 2 },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("你好 ridge");
    expect(wrapper.text()).toContain("你好，我在。");

    await wrapper.find("[data-testid='cancel-chat-button']").trigger("click");
    await flushPromises();
    expect(fetcher).toHaveBeenCalledWith(
      "https://ridge.example.com/api/sessions/s-chat/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps composer text when sending fails", async () => {
    seedMobileConnection();
    vi.spyOn(window, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/api/sessions") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "s-fail", title: "移动对话", status: "idle", createdAt: 1, updatedAt: 1 }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (target.endsWith("/messages") && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "send failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const wrapper = mount(ChatPage);
    await flushPromises();
    await wrapper.find("[data-testid='new-chat-button']").trigger("click");
    await flushPromises();
    await wrapper.find("[data-testid='chat-composer-textarea']").setValue("不要丢");
    await wrapper.find("[data-testid='send-chat-button']").trigger("click");
    await flushPromises();

    expect((wrapper.find("[data-testid='chat-composer-textarea']").element as HTMLTextAreaElement).value).toBe("不要丢");
    expect(wrapper.text()).toContain("send failed");
  });
});
